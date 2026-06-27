from __future__ import annotations

from base64 import b64encode
from collections import deque
from math import atan2, cos, gcd, isfinite, sin, sqrt
from pathlib import Path
import pandas as pd
import streamlit as st

from ra_polygon_search.core import SearchConfig, find_polygons, generate_vectors
from ra_polygon_search.db import connect, insert_solution, list_solutions, summary
from ra_polygon_search.examples import known_examples
from ra_polygon_search.orbit import default_seeds, orbit_vectors

DB_PATH = Path("outputs/solutions.sqlite")


def side_geodesic(vector):
    x, y, z = map(float, vector)
    q = x * x + y * z
    if abs(z) < 1e-12:
        return {"kind": "line", "x": -y / (2 * x)}
    return {"kind": "circle", "center": x / z, "radius": sqrt(q) / abs(z)}


def intersect_sides(first, second):
    g1 = side_geodesic(first)
    g2 = side_geodesic(second)

    if g1["kind"] == "line" and g2["kind"] == "line":
        raise ValueError("Adjacent vertical geodesics do not meet in the upper half-plane")
    if g1["kind"] == "line":
        x_coord = g1["x"]
        center = g2["center"]
        radius = g2["radius"]
    elif g2["kind"] == "line":
        x_coord = g2["x"]
        center = g1["center"]
        radius = g1["radius"]
    else:
        c1, r1 = g1["center"], g1["radius"]
        c2, r2 = g2["center"], g2["radius"]
        if abs(c2 - c1) < 1e-12:
            raise ValueError("Adjacent geodesics have the same center")
        x_coord = (r1 * r1 - r2 * r2 - c1 * c1 + c2 * c2) / (2 * (c2 - c1))
        center = c1
        radius = r1

    y_squared = radius * radius - (x_coord - center) ** 2
    if y_squared < -1e-9:
        raise ValueError("Adjacent geodesics do not meet in the upper half-plane")
    return (x_coord, sqrt(max(0.0, y_squared)))


def base_polygon_vertices(vectors):
    return [intersect_sides(vectors[i], vectors[(i + 1) % len(vectors)]) for i in range(len(vectors))]


def matmul(left, right):
    return (
        (
            left[0][0] * right[0][0] + left[0][1] * right[1][0],
            left[0][0] * right[0][1] + left[0][1] * right[1][1],
        ),
        (
            left[1][0] * right[0][0] + left[1][1] * right[1][0],
            left[1][0] * right[0][1] + left[1][1] * right[1][1],
        ),
    )


def normalize_matrix(matrix):
    entries = [matrix[0][0], matrix[0][1], matrix[1][0], matrix[1][1]]
    divisor = 0
    for entry in entries:
        divisor = gcd(divisor, abs(int(entry)))
    if divisor > 1:
        matrix = tuple(tuple(int(value) // divisor for value in row) for row in matrix)
        entries = [matrix[0][0], matrix[0][1], matrix[1][0], matrix[1][1]]
    for entry in entries:
        if entry < 0:
            return tuple(tuple(-int(value) for value in row) for row in matrix)
        if entry > 0:
            break
    return tuple(tuple(int(value) for value in row) for row in matrix)


def determinant(matrix):
    return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]


def apply_isometry(matrix, point):
    a, b = matrix[0]
    c, d = matrix[1]
    z_value = complex(point[0], point[1])
    if determinant(matrix) < 0:
        z_value = z_value.conjugate()
    denominator = c * z_value + d
    if abs(denominator) < 1e-12:
        return None
    image = (a * z_value + b) / denominator
    if not (isfinite(image.real) and isfinite(image.imag)):
        return None
    return (image.real, max(image.imag, 1e-9))


def tile_matrices(generators, depth, max_tiles):
    identity = ((1, 0), (0, 1))
    seen = {identity}
    queue = deque([(identity, 0)])
    tiles = [(identity, 0)]
    while queue and len(tiles) < max_tiles:
        matrix, tile_depth = queue.popleft()
        if tile_depth >= depth:
            continue
        for generator in generators:
            next_matrix = normalize_matrix(matmul(matrix, generator))
            if next_matrix in seen:
                continue
            seen.add(next_matrix)
            tiles.append((next_matrix, tile_depth + 1))
            queue.append((next_matrix, tile_depth + 1))
            if len(tiles) >= max_tiles:
                break
    return tiles


def sample_geodesic(first, second, steps=18):
    x1, y1 = first
    x2, y2 = second
    if abs(x2 - x1) < 1e-10:
        return [
            (x1, y1 + (y2 - y1) * step / steps)
            for step in range(steps + 1)
        ]
    center = ((x2 * x2 + y2 * y2) - (x1 * x1 + y1 * y1)) / (2 * (x2 - x1))
    radius = sqrt(max((x1 - center) ** 2 + y1 * y1, 1e-12))
    theta1 = atan2(y1, x1 - center)
    theta2 = atan2(y2, x2 - center)
    return [
        (
            center + radius * cos(theta1 + (theta2 - theta1) * step / steps),
            radius * sin(theta1 + (theta2 - theta1) * step / steps),
        )
        for step in range(steps + 1)
    ]


def polygon_path_points(vertices):
    points = []
    for index, first in enumerate(vertices):
        edge = sample_geodesic(first, vertices[(index + 1) % len(vertices)])
        points.extend(edge if index == 0 else edge[1:])
    return points


def build_tiling(data, depth, max_tiles):
    vectors = [tuple(map(int, vector)) for vector in data["vectors"]]
    generators = [normalize_matrix(tuple(tuple(map(int, row)) for row in matrix)) for matrix in data["matrices"]]
    base_vertices = base_polygon_vertices(vectors)
    tiles = []
    for matrix, tile_depth in tile_matrices(generators, depth, max_tiles):
        vertices = [apply_isometry(matrix, point) for point in base_vertices]
        if any(point is None for point in vertices):
            continue
        path_points = polygon_path_points(vertices)
        tiles.append({"depth": tile_depth, "vertices": vertices, "path": path_points})
    return tiles


def render_tiling_svg(tiles, width=920, height=560):
    if not tiles:
        return f"""
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 {width} {height}" role="img" aria-label="Upper-half plane tiling">
      <rect x="0" y="0" width="{width}" height="{height}" fill="#fbfcfd" />
      <text x="32" y="42" font-size="18" fill="#5d6675">No tiles could be generated for this example.</text>
    </svg>
    """

    all_points = [point for tile in tiles for point in tile["path"] if point[1] >= 0]
    x_values = [point[0] for point in all_points]
    y_values = [point[1] for point in all_points]
    x_min, x_max = min(x_values), max(x_values)
    y_max = max(y_values)
    x_padding = max((x_max - x_min) * 0.08, 0.5)
    x_min -= x_padding
    x_max += x_padding
    y_max = max(y_max * 1.15, 1.0)
    margin = 34
    plot_width = width - 2 * margin
    plot_height = height - 2 * margin

    def project(point):
        x_coord = margin + (point[0] - x_min) * plot_width / (x_max - x_min)
        y_coord = height - margin - point[1] * plot_height / y_max
        return (x_coord, y_coord)

    fills = ["#e9f5db", "#d7ecff", "#ffe6c7", "#f5ddff", "#dff7ef", "#ffe0e6"]
    paths = []
    for tile in sorted(tiles, key=lambda item: item["depth"], reverse=True):
        projected = [project(point) for point in tile["path"]]
        path_data = "M " + " L ".join(f"{x:.2f} {y:.2f}" for x, y in projected) + " Z"
        fill = fills[tile["depth"] % len(fills)]
        opacity = max(0.18, 0.58 - 0.07 * tile["depth"])
        stroke_width = 2.4 if tile["depth"] == 0 else 0.85
        stroke = "#18212f" if tile["depth"] == 0 else "#526070"
        paths.append(
            f'<path d="{path_data}" fill="{fill}" fill-opacity="{opacity:.2f}" '
            f'stroke="{stroke}" stroke-width="{stroke_width}" />'
        )

    axis_y = height - margin
    return f"""
<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 {width} {height}" role="img" aria-label="Upper-half plane tiling">
  <rect x="0" y="0" width="{width}" height="{height}" fill="#fbfcfd" />
  <line x1="{margin}" y1="{axis_y}" x2="{width - margin}" y2="{axis_y}" stroke="#1d2430" stroke-width="1.6" />
  {''.join(paths)}
  <text x="{margin}" y="{height - 9}" font-size="12" fill="#5d6675">{x_min:.2f}</text>
  <text x="{width - margin - 42}" y="{height - 9}" font-size="12" fill="#5d6675">{x_max:.2f}</text>
  <text x="{margin}" y="22" font-size="13" fill="#5d6675">Im z up to {y_max:.2f}</text>
</svg>
"""


def svg_image_tag(svg_markup):
        encoded = b64encode(svg_markup.encode("utf-8")).decode("ascii")
        return (
                f'<img alt="Upper-half plane tiling" src="data:image/svg+xml;base64,{encoded}" '
                'style="width:100%; border:1px solid #d9dee7; border-radius:6px; background:#fbfcfd;" />'
        )

st.set_page_config(page_title="Right-angled polygon search", layout="wide")
st.title("Right-angled polygon reflection search")
st.markdown(
    r"""
Searches for cyclic reflection configurations in the trace-zero model

$$R(x,y,z)=\begin{pmatrix}x&y\\z&-x\end{pmatrix},\qquad q=x^2+yz.$$

A primitive integral vector with $q$ an $S$-unit gives a reflection in
$\mathrm{PGL}_2(\mathbb Z[S^{-1}])$. Adjacent sides are required to satisfy
$B(v_i,v_{i+1})=0$, where $B(v,w)=2xx'+yz'+zy'$, and non-adjacent pairs must be hyperbolic.
"""
)

con = connect(DB_PATH)

with st.sidebar:
    st.header("Search parameters")
    prime_options = [2, 3, 5, 7, 11, 13]
    primes = st.multiselect("Allowed denominator primes", prime_options, default=[2, 3])
    sides = st.selectbox("Polygon sides", [5, 6, 7, 8], index=0)
    method = st.radio("Vector generation", ["orbit", "enumerate"], horizontal=True)
    max_norm = st.number_input("Max S-unit norm", min_value=1, value=10000, step=1000)
    coord_bound = st.number_input("Coordinate bound", min_value=10, value=500, step=100)
    max_vectors = st.number_input("Max vectors", min_value=100, value=50000, step=10000)
    max_solutions = st.number_input("Max new solutions", min_value=1, value=10, step=1)
    run = st.button("Run search", type="primary", disabled=not primes)
    seed = st.button("Insert known examples")

if seed:
    count = 0
    for ex in known_examples():
        count += int(insert_solution(con, ex))
    st.success(f"Inserted {count} new known example(s). Existing duplicates were skipped.")

if run:
    config = SearchConfig(
        primes=tuple(sorted(set(primes))),
        polygon_sides=int(sides),
        max_norm=int(max_norm),
        coord_bound=int(coord_bound),
        max_vectors=int(max_vectors),
        max_solutions=int(max_solutions),
    )
    with st.spinner("Generating candidate reflection vectors..."):
        if method == "orbit":
            vectors = orbit_vectors(config, default_seeds(config.primes))
        else:
            vectors = generate_vectors(config)
    st.info(f"Generated {len(vectors):,} candidate vectors.")

    with st.spinner("Searching orthogonality cycles..."):
        sols = find_polygons(config, vectors)
    inserted = 0
    for sol in sols:
        inserted += int(insert_solution(con, sol))
    st.success(f"Found {len(sols)} solution(s); inserted {inserted} new solution(s) into the database.")

st.header("Database summary")
summary_rows = summary(con)
if summary_rows:
    st.table(pd.DataFrame(summary_rows))
else:
    st.info("No examples in the database yet. Click 'Insert known examples' or run a search.")

st.header("Successful outputs")
col1, col2, col3 = st.columns(3)
with col1:
    filter_primes = st.text_input("Filter primes, e.g. 2,3", value="")
with col2:
    filter_sides = st.selectbox("Filter sides", [0, 5, 6, 7, 8], format_func=lambda x: "Any" if x == 0 else str(x))
with col3:
    limit = st.number_input("Rows", min_value=1, value=50, step=10)

prime_filter = None
if filter_primes.strip():
    prime_filter = [int(x) for x in filter_primes.split(",") if x.strip()]
rows = list_solutions(con, primes=prime_filter, polygon_sides=None if filter_sides == 0 else int(filter_sides), limit=int(limit))

if rows:
    table = []
    for r in rows:
        d = r["data"]
        table.append({
            "id": r["id"],
            "primes": r["primes"],
            "sides": r["polygon_sides"],
            "height": r["height"],
            "norms": d["norms"],
            "source": r["source"],
            "notes": r["notes"],
        })
    st.table(pd.DataFrame(table))

    selected_id = st.selectbox("Example group / solution id", [r["id"] for r in rows])
    selected = next(r for r in rows if r["id"] == selected_id)
    data = selected["data"]
    st.subheader(f"Solution {selected_id}")
    st.write("Vectors")
    st.code("\n".join(str(tuple(v)) for v in data["vectors"]))
    st.write("Reflection matrices")
    st.code("\n\n".join(str(m) for m in data["matrices"]))
    st.write("Gram matrix")
    st.table(pd.DataFrame(data["gram"]))

    st.subheader("Upper-half plane tiling")
    viz_col1, viz_col2 = st.columns(2)
    with viz_col1:
        tiling_depth = st.slider("Tiling depth", min_value=0, max_value=5, value=2, step=1)
    with viz_col2:
        tile_limit = st.slider("Tile limit", min_value=1, max_value=500, value=120, step=10)
    try:
        tiles = build_tiling(data, int(tiling_depth), int(tile_limit))
        st.caption(f"Rendered {len(tiles)} tile(s) from solution {selected_id}.")
        st.markdown(svg_image_tag(render_tiling_svg(tiles)), unsafe_allow_html=True)
    except ValueError as exc:
        st.warning(f"Could not generate this tiling: {exc}")
else:
    st.info("No matching solutions.")
