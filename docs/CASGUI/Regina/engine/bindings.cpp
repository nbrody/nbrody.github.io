// JS bindings for the Regina GUI.
//
// Every function is stateless: triangulations travel as isomorphism
// signatures and links as Link::sig(false, false) (which keeps chirality and
// orientation). Each call returns a JSON string; failures come back as
// {"error": "..."} instead of throwing across the wasm boundary.

#include <emscripten/bind.h>

#include <complex>
#include <functional>
#include <sstream>
#include <string>
#include <vector>

#include "algebra/abeliangroup.h"
#include "algebra/grouppresentation.h"
#include "angle/anglestructures.h"
#include "link/examplelink.h"
#include "link/link.h"
#include "manifold/manifold.h"
#include "packet/packet.h"
#include "maths/cyclotomic.h"
#include "snappea/snappeatriangulation.h"
#include "subcomplex/standardtri.h"
#include "surface/normalsurfaces.h"
#include "triangulation/dim3.h"
#include "triangulation/example3.h"

using namespace regina;

namespace {

// ---------- tiny JSON writer ----------

std::string q(const std::string& s) {
    std::string o = "\"";
    for (unsigned char c : s) {
        switch (c) {
            case '"': o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n"; break;
            case '\r': break;
            case '\t': o += "\\t"; break;
            default:
                if (c < 0x20) { char b[8]; snprintf(b, 8, "\\u%04x", c); o += b; }
                else o += static_cast<char>(c);
        }
    }
    return o + "\"";
}

struct Obj {
    std::ostringstream s;
    bool first = true;
    Obj() { s << '{'; }
    Obj& raw(const char* k, const std::string& v) {
        s << (first ? "" : ",") << q(k) << ':' << v; first = false; return *this;
    }
    Obj& str(const char* k, const std::string& v) { return raw(k, q(v)); }
    Obj& num(const char* k, long long v) { return raw(k, std::to_string(v)); }
    Obj& dbl(const char* k, double v) {
        std::ostringstream t; t.precision(15); t << v;
        std::string r = t.str();
        if (r == "nan" || r == "inf" || r == "-inf") r = "null";
        return raw(k, r);
    }
    Obj& b(const char* k, bool v) { return raw(k, v ? "true" : "false"); }
    std::string done() { s << '}'; return s.str(); }
};

template <typename T, typename F>
std::string arr(const T& items, F f) {
    std::string o = "[";
    bool first = true;
    for (const auto& x : items) { if (!first) o += ','; o += f(x); first = false; }
    return o + "]";
}

std::string guard(const std::function<std::string()>& f) {
    try {
        return f();
    } catch (const std::exception& e) {
        return Obj().str("error", e.what()).done();
    } catch (...) {
        return Obj().str("error", "Regina raised an unknown error").done();
    }
}

std::vector<long> ints(const std::string& s) {
    std::vector<long> v;
    std::string cur;
    for (char c : s + ",") {
        if ((c >= '0' && c <= '9') || c == '-') cur += c;
        else if (!cur.empty()) { v.push_back(std::stol(cur)); cur.clear(); }
    }
    return v;
}

long arg(const std::vector<long>& v, size_t i, long dflt) {
    return i < v.size() ? v[i] : dflt;
}

std::string abelian(const AbelianGroup& g) {
    std::vector<std::string> tors;
    for (size_t i = 0; i < g.countInvariantFactors(); ++i)
        tors.push_back(g.invariantFactor(i).str());
    return Obj().num("rank", g.rank())
        .raw("torsion", arr(tors, q))
        .str("text", g.str()).done();
}

Triangulation<3> T(const std::string& sig) {
    return Triangulation<3>::fromIsoSig(sig);
}

Link L(const std::string& sig) {
    return Link::fromSig(sig);
}

std::string triSig(const Triangulation<3>& t) {
    return Obj().str("sig", t.isoSig()).num("size", t.size()).done();
}

std::string linkSig(const Link& l) {
    return Obj().str("sig", l.sig(false, false)).num("crossings", l.size()).done();
}

const char* linkTypeName(Vertex<3>::Link t) {
    switch (t) {
        case Vertex<3>::Link::Sphere: return "sphere";
        case Vertex<3>::Link::Disc: return "disc";
        case Vertex<3>::Link::Torus: return "torus";
        case Vertex<3>::Link::KleinBottle: return "klein";
        case Vertex<3>::Link::NonStandardCusp: return "cusp";
        default: return "invalid";
    }
}

// ---------- triangulations ----------

Triangulation<3> example3(const std::string& name, const std::vector<long>& p) {
    if (name == "threeSphere") return Example<3>::threeSphere();
    if (name == "s2xs1") return Example<3>::s2xs1();
    if (name == "rp2xs1") return Example<3>::rp2xs1();
    if (name == "threeTorus") return Example<3>::threeTorus();
    if (name == "rp3rp3") return Example<3>::rp3rp3();
    if (name == "poincare") return Example<3>::poincare();
    if (name == "weeks") return Example<3>::weeks();
    if (name == "weberSeifert") return Example<3>::weberSeifert();
    if (name == "lens") return Example<3>::lens(arg(p, 0, 5), arg(p, 1, 2));
    if (name == "lst") return Example<3>::lst(arg(p, 0, 3), arg(p, 1, 4));
    if (name == "layeredLoop") return Example<3>::layeredLoop(arg(p, 0, 3), arg(p, 1, 0) != 0);
    if (name == "sfsOverSphere")
        return Example<3>::sfsOverSphere(arg(p, 0, 2), arg(p, 1, -1),
            arg(p, 2, 3), arg(p, 3, 1), arg(p, 4, 5), arg(p, 5, 1));
    if (name == "handlebody") return Example<3>::handlebody(arg(p, 0, 2));
    if (name == "solidKleinBottle") return Example<3>::solidKleinBottle();
    if (name == "figureEight") return Example<3>::figureEight();
    if (name == "trefoil") return Example<3>::trefoil();
    if (name == "whitehead") return Example<3>::whitehead();
    if (name == "gieseking") return Example<3>::gieseking();
    if (name == "smallClosedOrblHyperbolic") return Example<3>::smallClosedOrblHyperbolic();
    if (name == "smallClosedNonOrblHyperbolic") return Example<3>::smallClosedNonOrblHyperbolic();
    if (name == "bingsHouse") return Example<3>::bingsHouse();
    if (name == "idealGenusTwoHandlebody") return Example<3>::idealGenusTwoHandlebody();
    throw InvalidArgument("Unknown example: " + name);
}

std::string triLoad(std::string kind, std::string text, std::string params) {
    return guard([&] {
        if (kind == "isosig") return triSig(Triangulation<3>::fromIsoSig(text));
        if (kind == "dehydration") return triSig(Triangulation<3>::rehydrate(text));
        if (kind == "example") return triSig(example3(text, ints(params)));
        if (kind == "link") return triSig(L(text).complement(true));
        throw InvalidArgument("Unknown input type: " + kind);
    });
}

std::string triSummary(std::string sig) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        Obj o;
        o.str("sig", t.isoSig()).num("size", t.size());
        o.num("vertices", t.countVertices()).num("edges", t.countEdges())
         .num("triangles", t.countTriangles()).num("components", t.countComponents())
         .num("boundaryComponents", t.countBoundaryComponents());
        o.b("valid", t.isValid()).b("closed", t.isClosed()).b("orientable", t.isOrientable())
         .b("ideal", t.isIdeal()).b("connected", t.isConnected())
         .b("realBoundary", t.hasBoundaryTriangles()).b("standard", t.isStandard());
        o.num("eulerTri", t.eulerCharTri());
        if (t.isValid()) o.num("eulerManifold", t.eulerCharManifold());
        try { o.str("dehydration", t.dehydrate()); } catch (...) {}

        if (t.isValid()) {
            o.raw("h1", abelian(t.homology()));
            try { o.raw("h2", abelian(t.homology(2))); } catch (...) {}
            if (t.isClosed() || t.isIdeal()) {
                try { o.num("h2z2", t.homologyH2Z2()); } catch (...) {}
            }
        }

        std::vector<std::string> verts;
        for (auto v : t.vertices())
            verts.push_back(Obj().num("degree", v->degree())
                .str("link", linkTypeName(v->linkType()))
                .num("linkEuler", v->linkEulerChar()).done());
        o.raw("vertexList", arr(verts, [](const std::string& s) { return s; }));

        std::vector<std::string> edges;
        for (auto e : t.edges())
            edges.push_back(Obj().num("degree", e->degree())
                .b("boundary", e->isBoundary()).b("valid", e->isValid()).done());
        o.raw("edgeList", arr(edges, [](const std::string& s) { return s; }));

        // Gluing table: for each tetrahedron and face f, [adjacent tet, image of the
        // three vertices of face f] (as in Regina's own gluing editor), or null.
        std::vector<std::string> rows;
        for (auto tet : t.tetrahedra()) {
            std::vector<std::string> faces;
            for (int f = 3; f >= 0; --f) {
                auto adj = tet->adjacentTetrahedron(f);
                if (!adj) { faces.push_back("null"); continue; }
                Perm<4> g = tet->adjacentGluing(f);
                std::string img;
                for (int i = 0; i < 4; ++i) if (i != f) img += char('0' + g[i]);
                faces.push_back(Obj().num("tet", adj->index()).str("img", img).done());
            }
            rows.push_back(arr(faces, [](const std::string& s) { return s; }));
        }
        o.raw("gluings", arr(rows, [](const std::string& s) { return s; }));
        return o.done();
    });
}

std::string triGroup(std::string sig) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        GroupPresentation g = t.group();
        g.simplify();
        Obj o;
        o.str("tex", g.tex()).str("text", g.str())
         .num("generators", g.countGenerators()).num("relations", g.countRelations());
        std::string rec = g.recogniseGroup();
        o.str("recognized", rec);
        return o.done();
    });
}

std::string triRecognize(std::string sig) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        Obj o;
        auto std = StandardTriangulation::recognise(t);
        if (std) {
            o.str("triangulation", std->name()).str("triangulationTex", std->texName());
            auto m = std->manifold();
            if (m) o.str("manifold", m->name()).str("manifoldTex", m->texName());
        }
        return o.done();
    });
}

std::string triProp(std::string sig, std::string name) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        Obj o;
        if (name == "zeroEfficient") o.b("value", t.isZeroEfficient());
        else if (name == "oneEfficient") o.b("value", t.isOneEfficient());
        else if (name == "sphere") o.b("value", t.isSphere());
        else if (name == "ball") o.b("value", t.isBall());
        else if (name == "solidTorus") o.b("value", t.isSolidTorus());
        else if (name == "txi") o.b("value", t.isTxI());
        else if (name == "handlebody") o.num("value", t.recogniseHandlebody());
        else if (name == "irreducible") o.b("value", t.isIrreducible());
        else if (name == "compressingDisc") o.b("value", t.hasCompressingDisc());
        else if (name == "haken") o.b("value", t.isHaken());
        else if (name == "strictAngle") o.b("value", t.hasStrictAngleStructure());
        else throw InvalidArgument("Unknown property: " + name);
        return o.done();
    });
}

std::string triOp(std::string sig, std::string op, int param) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        if (op == "summands" || op == "components") {
            auto parts = (op == "summands") ? t.summands() : t.triangulateComponents();
            return Obj().raw("sigs", arr(parts, [](const Triangulation<3>& p) {
                return q(p.isoSig()); })).done();
        }
        bool changed = true;
        if (op == "simplify") changed = t.simplify();
        else if (op == "simplifyExhaustive") changed = t.simplifyExhaustive(param > 0 ? param : 2);
        else if (op == "idealToFinite") changed = t.idealToFinite();
        else if (op == "finiteToIdeal") changed = t.finiteToIdeal();
        else if (op == "subdivide") t.subdivide();
        else if (op == "puncture") t.puncture();
        else if (op == "doubleCover") t = t.doubleCover();
        else if (op == "minimiseBoundary") changed = t.minimiseBoundary();
        else if (op == "minimiseVertices") changed = t.minimiseVertices();
        else throw InvalidArgument("Unknown operation: " + op);
        return Obj().str("sig", t.isoSig()).num("size", t.size()).b("changed", changed).done();
    });
}

std::string triTV(std::string sig, int r, bool parity) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        Cyclotomic c = t.turaevViro(r, parity);
        std::complex<double> v = c.evaluate(1);
        return Obj().str("exact", c.str("z")).num("field", c.field())
            .dbl("approx", v.real()).dbl("approxIm", v.imag()).done();
    });
}

std::string triSnap(std::string sig) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        SnapPeaTriangulation s(t);
        Obj o;
        o.b("null", s.isNull());
        if (s.isNull()) return o.done();
        o.num("solution", static_cast<int>(s.solutionType()));
        o.dbl("volume", s.volume()).b("volumeZero", s.volumeZero());
        o.num("cusps", s.countCusps());
        std::vector<std::string> shapes;
        for (size_t i = 0; i < s.size(); ++i) {
            auto z = s.shape(i);
            shapes.push_back(Obj().dbl("re", z.real()).dbl("im", z.imag()).done());
        }
        o.raw("shapes", arr(shapes, [](const std::string& x) { return x; }));
        try { o.raw("homologyFilled", abelian(s.homologyFilled())); } catch (...) {}
        return o.done();
    });
}

std::string triFill(std::string sig, int m, int l, int cusp) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        SnapPeaTriangulation s(t);
        if (s.isNull()) throw InvalidArgument("SnapPea could not use this triangulation (it needs an ideal triangulation with torus or Klein bottle cusps).");
        if (!s.fill(m, l, cusp)) throw InvalidArgument("That filling is not allowed (for a Klein bottle cusp, the longitude coefficient must be even).");
        Obj o;
        o.num("solution", static_cast<int>(s.solutionType())).dbl("volume", s.volume());
        Triangulation<3> f = (s.countCusps() == 1) ? s.filledAll() : static_cast<Triangulation<3>>(s.filledPartial(cusp));
        f.simplify();
        o.str("sig", f.isoSig()).num("size", f.size());
        return o.done();
    });
}

// ---------- normal surfaces ----------

NormalCoords coordsOf(const std::string& c) {
    if (c == "quad") return NormalCoords::Quad;
    if (c == "quadClosed") return NormalCoords::QuadClosed;
    return NormalCoords::Standard;
}

Flags<NormalList> listOf(const std::string& w) {
    return (w == "fundamental") ? (NormalList::Fundamental | NormalList::EmbeddedOnly)
                                : (NormalList::Vertex | NormalList::EmbeddedOnly);
}

std::string surfaces(std::string sig, std::string coords, std::string which, int limit) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        NormalSurfaces list(t, coordsOf(coords), listOf(which));
        Obj o;
        o.num("count", list.size());
        std::vector<std::string> out;
        size_t n = std::min<size_t>(list.size(), limit > 0 ? limit : 5000);
        for (size_t i = 0; i < n; ++i) {
            const NormalSurface& s = list[i];
            Obj so;
            bool compact = s.isCompact();
            so.b("compact", compact);
            if (compact) {
                try { so.str("euler", s.eulerChar().str()); } catch (...) {}
                try { so.b("orientable", s.isOrientable()); } catch (...) {}
                try { so.b("twoSided", s.isTwoSided()); } catch (...) {}
                try { so.b("connected", s.isConnected()); } catch (...) {}
                try { so.b("boundary", s.hasRealBoundary()); } catch (...) {}
                try { so.num("boundaries", s.countBoundaries()); } catch (...) {}
            }
            try { so.b("vertexLink", s.isVertexLinking()); } catch (...) {}
            try { so.b("splitting", s.isSplitting()); } catch (...) {}
            try { so.num("central", s.isCentral()); } catch (...) {}
            // Coordinates in the chosen system (standard: 7 per tet, quad: 3 per tet).
            std::vector<std::string> v;
            bool quad = (coords != "standard");
            for (size_t k = 0; k < t.size(); ++k) {
                if (!quad) for (int j = 0; j < 4; ++j) v.push_back(s.triangles(k, j).str());
                for (int j = 0; j < 3; ++j) v.push_back(s.quads(k, j).str());
            }
            so.raw("coords", arr(v, q));
            std::vector<std::string> ew;
            if (compact) for (size_t k = 0; k < t.countEdges(); ++k) ew.push_back(s.edgeWeight(k).str());
            so.raw("edgeWeights", arr(ew, q));
            out.push_back(so.done());
        }
        o.raw("list", arr(out, [](const std::string& x) { return x; }));
        return o.done();
    });
}

std::string surfaceOp(std::string sig, std::string coords, std::string which, int index, std::string op) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        NormalSurfaces list(t, coordsOf(coords), listOf(which));
        if (index < 0 || static_cast<size_t>(index) >= list.size())
            throw InvalidArgument("Surface index out of range");
        const NormalSurface& s = list[index];
        Obj o;
        if (op == "cut") { auto c = s.cutAlong(); o.str("sig", c.isoSig()).num("size", c.size()); }
        else if (op == "crush") { auto c = s.crush(); o.str("sig", c.isoSig()).num("size", c.size()); }
        else if (op == "incompressible") o.b("value", s.isIncompressible());
        else if (op == "compressingDisc") o.b("value", s.isCompressingDisc());
        else throw InvalidArgument("Unknown surface operation: " + op);
        return o.done();
    });
}

// ---------- angle structures ----------

std::string angles(std::string sig, bool tautOnly, int limit) {
    return guard([&] {
        Triangulation<3> t = T(sig);
        AngleStructures list(t, tautOnly);
        Obj o;
        o.num("count", list.size()).b("spansStrict", list.spansStrict()).b("spansTaut", list.spansTaut());
        std::vector<std::string> out;
        size_t n = std::min<size_t>(list.size(), limit > 0 ? limit : 2000);
        for (size_t i = 0; i < n; ++i) {
            const AngleStructure& a = list[i];
            std::vector<std::string> tets;
            for (size_t k = 0; k < t.size(); ++k) {
                std::vector<std::string> e;
                for (int j = 0; j < 3; ++j) e.push_back(q(a.angle(k, j).tex()));
                tets.push_back(arr(e, [](const std::string& x) { return x; }));
            }
            out.push_back(Obj().b("strict", a.isStrict()).b("taut", a.isTaut())
                .b("veering", a.isVeering())
                .raw("angles", arr(tets, [](const std::string& x) { return x; })).done());
        }
        o.raw("list", arr(out, [](const std::string& x) { return x; }));
        return o.done();
    });
}

// ---------- links ----------

Link exampleLink(const std::string& name, const std::vector<long>& p) {
    if (name == "unknot") return ExampleLink::unknot();
    if (name == "trefoilLeft") return ExampleLink::trefoilLeft();
    if (name == "trefoilRight") return ExampleLink::trefoilRight();
    if (name == "figureEight") return ExampleLink::figureEight();
    if (name == "hopf") return ExampleLink::hopf();
    if (name == "whitehead") return ExampleLink::whitehead();
    if (name == "borromean") return ExampleLink::borromean();
    if (name == "conway") return ExampleLink::conway();
    if (name == "kinoshitaTerasaka") return ExampleLink::kinoshitaTerasaka();
    if (name == "torus") return ExampleLink::torus(arg(p, 0, 2), arg(p, 1, 3));
    if (name == "gst") return ExampleLink::gst();
    if (name == "monster") return ExampleLink::monster();
    if (name == "gordian") return ExampleLink::gordian();
    throw InvalidArgument("Unknown example: " + name);
}

std::string linkLoad(std::string kind, std::string text, std::string params) {
    return guard([&] {
        if (kind == "pd") return linkSig(Link::fromPD(text));
        if (kind == "dt") return linkSig(Link::fromDT(text));
        if (kind == "gauss") return linkSig(Link::fromGauss(text));
        if (kind == "ogauss") return linkSig(Link::fromOrientedGauss(text));
        if (kind == "sig") return linkSig(Link::fromSig(text));
        if (kind == "example") return linkSig(exampleLink(text, ints(params)));
        throw InvalidArgument("Unknown input type: " + kind);
    });
}

std::string linkSummary(std::string sig) {
    return guard([&] {
        Link l = L(sig);
        Obj o;
        o.str("sig", l.sig(false, false)).num("crossings", l.size())
         .num("components", l.countComponents()).num("trivialComponents", l.countTrivialComponents())
         .num("writhe", l.writhe()).b("classical", l.isClassical());
        try { o.num("linking", l.linking()); } catch (...) {}
        try { o.b("alternating", l.isAlternating()); } catch (...) {}
        try { o.num("seifertCircles", l.seifertCircles()); } catch (...) {}
        o.str("pd", l.pd()).str("brief", l.brief());
        if (l.countComponents() == 1) {
            try { o.str("gauss", l.gauss()); } catch (...) {}
            try { o.str("ogauss", l.orientedGauss()); } catch (...) {}
            try { o.str("dt", l.dt()); } catch (...) {}
            try { o.str("dtAlpha", l.dt(true)); } catch (...) {}
        }
        std::vector<std::string> signs;
        for (size_t i = 0; i < l.size(); ++i) signs.push_back(std::to_string(l.crossing(i)->sign()));
        o.raw("signs", arr(signs, [](const std::string& x) { return x; }));
        return o.done();
    });
}

template <typename P>
std::string laurentJSON(const P& p) {
    std::vector<std::string> c;
    if (p.isZero()) return Obj().num("min", 0).raw("coeffs", "[]").done();
    for (long e = p.minExp(); e <= p.maxExp(); ++e) c.push_back(p[e].str());
    return Obj().num("min", p.minExp()).raw("coeffs", arr(c, q)).done();
}

std::string linkPolys(std::string sig, bool homfly) {
    return guard([&] {
        Link l = L(sig);
        Obj o;
        o.raw("jones", laurentJSON(l.jones()));
        if (l.countComponents() == 1 && l.isClassical()) {
            const auto& a = l.alexander();
            std::vector<std::string> c;
            for (size_t i = 0; i <= a.degree(); ++i) c.push_back(a[i].str());
            o.raw("alexander", arr(c, q));
        }
        if (homfly && l.isClassical()) {
            o.str("homflyAZ", l.homflyAZ().str("a", "z"));
            o.str("homflyLM", l.homflyLM().str("l", "m"));
        }
        return o.done();
    });
}

std::string linkGroup(std::string sig) {
    return guard([&] {
        Link l = L(sig);
        GroupPresentation g = l.group(true);
        return Obj().str("tex", g.tex()).str("text", g.str())
            .num("generators", g.countGenerators()).num("relations", g.countRelations())
            .str("recognized", g.recogniseGroup()).done();
    });
}

std::string linkOp(std::string sig, std::string op, int param) {
    return guard([&] {
        Link l = L(sig);
        if (op == "complement") {
            Triangulation<3> t = l.complement(true);
            return Obj().str("triSig", t.isoSig()).num("size", t.size()).done();
        }
        bool changed = true;
        if (op == "simplify") changed = l.simplify();
        else if (op == "simplifyExhaustive") changed = l.simplifyExhaustive(param > 0 ? param : 1);
        else if (op == "reflect") l.reflect();
        else if (op == "reverse") l.reverse();
        else if (op == "rotate") l.rotate();
        else if (op == "changeAll") l.changeAll();
        else if (op == "whiteheadDouble") l = l.whiteheadDouble(param >= 0);
        else if (op == "parallel") l = l.parallel(param > 1 ? param : 2);
        else throw InvalidArgument("Unknown operation: " + op);
        return Obj().str("sig", l.sig(false, false)).num("crossings", l.size()).b("changed", changed).done();
    });
}

// ---------- Regina data files ----------

// Reads a .rga file (bytes from JS) and lists its 3-manifold triangulations
// and links, each with its packet label and signature.
std::string openRga(emscripten::val bytes) {
    return guard([&] {
        std::vector<uint8_t> v = emscripten::convertJSArrayToNumberVector<uint8_t>(bytes);
        std::istringstream in(std::string(v.begin(), v.end()));
        std::shared_ptr<Packet> root = regina::open(in);
        if (!root) throw InvalidArgument("This does not look like a Regina data file.");
        std::vector<std::string> items;
        for (auto& p : root->descendants()) {
            if (p.type() == PacketType::Triangulation3) {
                const auto& t = static_cast<const PacketOf<Triangulation<3>>&>(p);
                items.push_back(Obj().str("kind", "tri").str("label", p.humanLabel())
                    .str("sig", t.isoSig()).num("size", t.size()).done());
            } else if (p.type() == PacketType::Link) {
                const auto& l = static_cast<const PacketOf<Link>&>(p);
                items.push_back(Obj().str("kind", "link").str("label", p.humanLabel())
                    .str("sig", l.sig(false, false)).num("size", l.size()).done());
            }
        }
        return Obj().raw("items", arr(items, [](const std::string& x) { return x; })).done();
    });
}

std::string version() {
    return Obj().str("regina", "7.4.1").str("snappy", "3.0.3").done();
}

} // namespace

EMSCRIPTEN_BINDINGS(regina_gui) {
    emscripten::function("version", &version);
    emscripten::function("triLoad", &triLoad);
    emscripten::function("triSummary", &triSummary);
    emscripten::function("triGroup", &triGroup);
    emscripten::function("triRecognize", &triRecognize);
    emscripten::function("triProp", &triProp);
    emscripten::function("triOp", &triOp);
    emscripten::function("triTV", &triTV);
    emscripten::function("triSnap", &triSnap);
    emscripten::function("triFill", &triFill);
    emscripten::function("surfaces", &surfaces);
    emscripten::function("surfaceOp", &surfaceOp);
    emscripten::function("angles", &angles);
    emscripten::function("linkLoad", &linkLoad);
    emscripten::function("linkSummary", &linkSummary);
    emscripten::function("linkPolys", &linkPolys);
    emscripten::function("linkGroup", &linkGroup);
    emscripten::function("linkOp", &linkOp);
    emscripten::function("openRga", &openRga);
}
