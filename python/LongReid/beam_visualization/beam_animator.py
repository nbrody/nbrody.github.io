
import math
import random
import time
import flint
from flint import fmpz, fmpz_mat
from sympy import factorint
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import numpy as np
import networkx as nx

# --- Configuration ---
BEAM_WIDTH = 10000
MAX_ITERATIONS = 82   # Number of frames/iterations to show
T_PARAM = fmpz(9)

# --- Group Definition ---
PRIMES = {p for p, _ in (T_PARAM * (T_PARAM - 1)).factor()}

MAT_a = flint.fmpz_mat(2, 2, [T_PARAM, 0, 0, 1])
MAT_b = flint.fmpz_mat(2, 2, [1 + T_PARAM**2, 2, T_PARAM, 1])
MAT_A = flint.fmpz_mat(2, 2, [1, 0, 0, T_PARAM])
MAT_B = flint.fmpz_mat(2, 2, [1, -2, -T_PARAM, 1 + T_PARAM**2])

ACTIONS = (MAT_a, MAT_b, MAT_A, MAT_B)
ACTION_NAMES = ('a', 'b', 'ai', 'bi')
INVERSES = (2, 3, 0, 1)

def canonicalize_mat(M):
    g = fmpz(1)
    for p in PRIMES:
        while all(entry % p == 0 for entry in M.entries()):
            M /= p
            g *= p
    return M, g

class Node:
    __slots__ = ('parent', 'action', 'matrix', 'score', 'depth', 'is_random')

    def __init__(self, parent, action, matrix):
        self.parent = parent
        self.action = action
        self.matrix = matrix
        self.score = self._calc_score()
        self.depth = 0 if parent is None else parent.depth + 1
        self.is_random = False

    def _calc_score(self):
        det = abs(self.matrix.det())
        if det == 0:
            return float('inf')
        return math.log(int(det))

    def get_height(self):
        # Height = n + m where det = 2^n * 3^m * k
        det = int(abs(self.matrix.det()))
        if det == 0: return 999
        
        factors = factorint(det)
        n = factors.get(2, 0)
        m = factors.get(3, 0)
        
        return n + m

    def get_word(self):
        if self.parent is None:
            return "Id"
        path = []
        curr = self
        while curr.parent is not None:
            path.append(ACTION_NAMES[curr.action])
            curr = curr.parent
        return ".".join(reversed(path))

    def get_disk_coords(self):
        # Convert entries to complex/float
        a = int(self.matrix[0, 0])
        b = int(self.matrix[0, 1])
        c = int(self.matrix[1, 0])
        d = int(self.matrix[1, 1])
        
        # z = (ai + b) / (ci + d)
        num = a * 1j + b
        den = c * 1j + d
        
        if den == 0:
            z = float('inf') 
        else:
            z = num / den
            
        # Map to Poincaré disk: w = (z - i) / (z + i)
        if z == -1j:
            w = complex(1, 0)
        else:
            w = (z - 1j) / (z + 1j)
            
        return w.real, w.imag

# --- Layout Generation ---
def generate_layout(max_depth=6):
    """
    Generates positions for the background tree up to max_depth using hyperbolic coordinates.
    """
    pos = {}
    
    # Queue: (path_tuple, matrix, depth)
    root_mat = fmpz_mat(2, 2, [1, 0, 0, 1])
    
    # Root at 0,0
    pos[()] = (0.0, 0.0)
    
    queue = [ ((), root_mat, 0) ]
    
    while queue:
        path, mat, depth = queue.pop(0)
        
        if depth >= max_depth:
            continue
            
        last_action = path[-1] if path else None
        
        for move, mat_move in enumerate(ACTIONS):
            if last_action is not None and INVERSES[last_action] == move:
                continue
            
            # Compute new matrix
            # We don't need canonicalize for coordinates, but good to keep numbers checkable?
            # Actually, for visualization we just need the raw product to get the action.
            # But wait, canonicalize divides by scalars. Scalars don't affect fractional linear transform.
            # So we can just multiply.
            new_mat = mat * mat_move
            
            # Compute coords
            a = int(new_mat[0, 0])
            b = int(new_mat[0, 1])
            c = int(new_mat[1, 0])
            d = int(new_mat[1, 1])
            
            num = a * 1j + b
            den = c * 1j + d
            z = num / den if den != 0 else float('inf')
            w = (z - 1j) / (z + 1j)
            
            new_path = path + (move,)
            pos[new_path] = (w.real, w.imag)
            
            queue.append((new_path, new_mat, depth + 1))
            
    return pos

# --- Beam Search with History ---
def run_search_and_record(random_rate):
    top_count = int(BEAM_WIDTH * (1 - random_rate))
    random_count = int(BEAM_WIDTH * random_rate)
    
    root_mat = fmpz_mat(2, 2, [1, 0, 0, 1])
    root = Node(None, None, root_mat)
    
    current_beam = [root]
    visited = set()
    
    history = [] # List of (x, y, height, is_random) lists
    saved_integer_nodes = {} # Map word -> Node to avoid duplicates
    
    print(f"Starting search (Random Rate: {random_rate})...")
    
    for i in range(MAX_ITERATIONS):
        # Record current beam
        beam_data = []
        for node in current_beam:
            x, y = node.get_disk_coords()
            h = node.get_height()
            beam_data.append((x, y, h, node.is_random))
            
            if h == 0:
                w = node.get_word()
                # Check for Id or -Id
                is_neg_id = (node.matrix[0,0] == -1 and node.matrix[1,1] == -1 and 
                             node.matrix[0,1] == 0 and node.matrix[1,0] == 0)
                
                if w != "Id" and not is_neg_id and w not in saved_integer_nodes:
                    saved_integer_nodes[w] = node
                    
        history.append(beam_data)
        
        next_beam = []
        for node in current_beam:
            last_action = node.action
            for move, mat_move in enumerate(ACTIONS):
                if last_action is not None and INVERSES[last_action] == move:
                    continue
                
                new_mat, _ = canonicalize_mat(node.matrix * mat_move)
                uid = tuple(int(x) for x in new_mat.entries())
                
                if uid in visited:
                    continue
                visited.add(uid)
                
                child = Node(node, move, new_mat)
                
                # Check solution
                if abs(child.matrix.det()) == 1 and child.matrix[0,0] + child.matrix[1,1] > 2:
                    print(f"Found solution at iter {i}")
                
                next_beam.append(child)
        
        if not next_beam:
            break
            
        next_beam.sort(key=lambda x: x.score)
        
        best = next_beam[:top_count]
        random_cands = []
        if len(next_beam) > top_count:
            remainder = next_beam[top_count:]
            sample_size = min(len(remainder), random_count)
            random_cands = random.sample(remainder, sample_size)
            # Mark random candidates
            for rc in random_cands:
                rc.is_random = True
            
        current_beam = best + random_cands
        print(f"Iter {i} done. Beam size: {len(current_beam)}")

    # Record the final beam (Depth MAX_ITERATIONS)
    beam_data = []
    for node in current_beam:
        x, y = node.get_disk_coords()
        h = node.get_height()
        beam_data.append((x, y, h, node.is_random))
        
        if h == 0:
            w = node.get_word()
            # Check for Id or -Id
            is_neg_id = (node.matrix[0,0] == -1 and node.matrix[1,1] == -1 and 
                         node.matrix[0,1] == 0 and node.matrix[1,0] == 0)
            
            if w != "Id" and not is_neg_id and w not in saved_integer_nodes:
                saved_integer_nodes[w] = node
                
    history.append(beam_data)

    print(f"\n--- Found {len(saved_integer_nodes)} Integer Matrices (Height 0) ---")
    for w, node in saved_integer_nodes.items():
        # Calculate word length (number of components separated by '.')
        # If w is "Id", length is 0
        length = 0 if w == "Id" else len(w.split('.'))
        print(f"Word: Length {length}, {w}")
        print(f"Matrix:\n{node.matrix}")
        print("-" * 20)

    return history


def get_geodesic_points(z1, z2, num_points=30):
    """
    Returns a list of complex points representing the hyperbolic geodesic segment between z1 and z2.
    """
    z1 = complex(z1[0], z1[1])
    z2 = complex(z2[0], z2[1])
    
    if abs(z1 - z2) < 1e-6:
        return [z1, z2]
        
    # Mobius transform mapping z1 to 0
    # w = (z - z1) / (1 - conj(z1)*z)
    def to_origin(z):
        return (z - z1) / (1 - z1.conjugate() * z)
        
    def from_origin(w):
        return (w + z1) / (1 + z1.conjugate() * w)
        
    w2 = to_origin(z2)
    
    # Segment from 0 to w2 is a straight line
    points = []
    for t in np.linspace(0, 1, 50):
        w = w2 * t
        z = from_origin(w)
        points.append(z)
        
    return points


from mpl_toolkits.mplot3d import Axes3D

# --- Animation ---
def create_animation(random_rate, filename):
    # 1. Layout
    print("Generating layout...")
    layout_depth = 7
    pos = generate_layout(layout_depth)
    
    # 2. Run Search
    print(f"Running search for {filename}...")
    history = run_search_and_record(random_rate)
    
    # Add pause at the end
    if history:
        last_frame = history[-1]
        for _ in range(12):
            history.append(last_frame)
    
    # 3. Setup Plot
    fig = plt.figure(figsize=(12, 15))
    ax = fig.add_subplot(111, projection='3d')
    ax.set_facecolor('black')
    fig.patch.set_facecolor('black')
    ax.axis('off')
    
    # Draw Unit Circle at z=0
    # 3D plot of a circle
    theta = np.linspace(0, 2*np.pi, 100)
    xc = np.cos(theta)
    yc = np.sin(theta)
    zc = np.zeros_like(theta)
    ax.plot(xc, yc, zc, color='white', alpha=0.5, linewidth=1)
    
    # Draw static edges as geodesics at z=0
    print("Drawing background (geodesics)...")
    
    # Group edges by depth
    edges_by_depth = {}
    
    for path, (x, y) in pos.items():
        if len(path) > 0:
            depth = len(path)
            if depth not in edges_by_depth:
                edges_by_depth[depth] = {'x': [], 'y': [], 'z': []}
                
            parent_path = path[:-1]
            if parent_path in pos:
                px, py = pos[parent_path]
                
                points = get_geodesic_points((px, py), (x, y))
                
                for p in points:
                    edges_by_depth[depth]['x'].append(p.real)
                    edges_by_depth[depth]['y'].append(p.imag)
                    edges_by_depth[depth]['z'].append(0)
                edges_by_depth[depth]['x'].append(np.nan) # Break line
                edges_by_depth[depth]['y'].append(np.nan)
                edges_by_depth[depth]['z'].append(np.nan)
                
    # Plot edges by depth with varying thickness and brightness
    for depth in sorted(edges_by_depth.keys()):
        data = edges_by_depth[depth]
        # Thicker and brighter near center (low depth)
        # Shrink as they move to boundary (high depth)
        
        # Linewidth decay
        lw = 2.5 * (0.6 ** (depth - 1))
        
        # Alpha decay (brightness)
        # Start bright white, maybe fade slightly?
        # Or keep white but reduce alpha
        alpha = 0.6 * (0.85 ** (depth - 1))
        
        ax.plot(data['x'], data['y'], data['z'], color='white', alpha=alpha, linewidth=lw)
    
    # Scatter for beam nodes
    scat = ax.scatter([], [], [], s=20, c=[], depthshade=False, edgecolors='none')
    
    # Set limits
    ax.set_xlim(-1.1, 1.1)
    ax.set_ylim(-1.1, 1.1)
    ax.set_zlim(0, 20) # Height is n+m, usually small integers
    
    # Set view angle
    ax.view_init(elev=30, azim=-60)
    
    # Remove panes/grid
    ax.grid(False)
    ax.xaxis.pane.fill = False
    ax.yaxis.pane.fill = False
    ax.zaxis.pane.fill = False
    ax.xaxis.pane.set_edgecolor('black')
    ax.yaxis.pane.set_edgecolor('black')
    ax.zaxis.pane.set_edgecolor('black')
    
    # Remove margins and zoom in
    plt.subplots_adjust(left=0, right=1, bottom=0, top=1)
    ax.dist = 7  # Zoom in (default is ~10)
    
    # Iteration text at the bottom with a "cuter" font
    # 'Chalkboard' is a common Mac font that looks handwritten/cute. 
    # Fallback to 'Comic Sans MS' or cursive.
    iteration_text = fig.text(0.5, 0.05, "", ha='center', color='white', fontsize=20, fontname='Helvetica')

    # Custom colormap logic
    def get_colors(beam_nodes):
        colors = []
        for x, y, h, is_random in beam_nodes:
            if is_random:
                colors.append((1, 0.84, 0, 1)) # Gold
            elif h == 0:
                colors.append((0, 1, 0, 1)) # Green
            else:
                # Interpolate Green to Dark Blue
                ratio = min(h / 15.0, 1.0)
                r = 0
                g = 1.0 - ratio
                b = ratio * 0.8 
                colors.append((r, g, b, 1))
        return colors

    persistent_zeros = set()

    # Update function
    def update(frame):
        if frame >= len(history):
            return scat,
            
        beam_nodes = history[frame]
        
        # Identify height 0 nodes and add to persistent set
        for node in beam_nodes:
            x, y, h, is_rnd = node
            if h == 0:
                # Check if identity (x,y close to 0,0)
                # We only want non-identity integer matrices
                if x*x + y*y > 1e-9:
                    # Store as tuple. Force is_random=False for persistence so it stays Green
                    persistent_zeros.add((x, y, h, False))
        
        # Combine persistent nodes with current beam
        # We convert persistent_zeros to a list
        all_nodes = list(persistent_zeros) + beam_nodes
        
        xs = []
        ys = []
        zs = []
        
        for x, y, h, is_rnd in all_nodes:
            xs.append(x)
            ys.append(y)
            zs.append(h)
        
        # Scale Z-axis by 1/12
        zs_scaled = [z / 12.0 for z in zs]
        
        # Update scatter data
        scat._offsets3d = (xs, ys, zs_scaled)
        
        # Set colors manually
        c = get_colors(all_nodes)
        scat.set_color(c)
        
        # Dynamic Camera & Limits
        current_max_h = 0
        if zs_scaled:
            current_max_h = max(zs_scaled)
            
        # Fixed camera until height > 20 (scaled height > ~1.66)
        # But user said "show z-axis up to height 20 by default".
        # So min limit is 20/12 = 1.666
        
        # Actually, let's work with raw height for the limit logic to be clearer
        # We plot zs_scaled, so limits need to be scaled.
        
        limit_h_raw = max(20, (current_max_h * 12.0) + 2)
        limit_h_scaled = limit_h_raw / 12.0
        
        # Adjust Z-limit
        ax.set_zlim(0, limit_h_scaled)
        
        # Adjust Box Aspect
        try:
            ax.set_box_aspect((1, 1, limit_h_scaled / 2.2))
        except AttributeError:
            pass
        
        # Zoom logic
        # Zoom out only if we exceed the default height of 20
        if limit_h_raw <= 20.1:
            ax.dist = 7
        else:
            # Zoom out
            ax.dist = 7 + (limit_h_raw - 20) * 0.5
        
        # Update text
        disp_frame = min(frame, MAX_ITERATIONS)
        iteration_text.set_text(f"Iteration {disp_frame}")
        
        return scat, iteration_text

    print(f"Creating animation for {filename}...")
    ani = animation.FuncAnimation(fig, update, frames=len(history), blit=False, interval=100)
    
    # Save
    print(f"Saving video to {filename}...")
    ani.save(filename, writer='ffmpeg', fps=6, dpi=100)
    print("Done!")

if __name__ == "__main__":
    # 1. Randomness = 0
    create_animation(0.0, 'beam_search_r0.mp4')
    
    # 2. Randomness = 0.2
    create_animation(0.2, 'beam_search_r02.mp4')
    
    # 3. Randomness = 1.0 (Every word is random)
    create_animation(1.0, 'beam_search_r1.mp4')
