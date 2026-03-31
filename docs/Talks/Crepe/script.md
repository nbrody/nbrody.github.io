# Symmetry and Space — Talk Script

**Science on Tap · The Crepe Place · April 6, 2026**
**Nic Brody · UC Santa Cruz**

---

## 1. Title

Hi everyone, thanks for coming out tonight. I'm Nic, I'm a mathematician at UC Santa Cruz, and tonight I want to introduce you to my research area of geometric group theory. We will build up to a result called the Banach-Tarski paradox, which says you can take a ball, cut it into a finite number of pieces, and rearrange those pieces into *two* balls, each the same size as the original.

To get there, we're going to need to talk about what "distance" means, what "symmetry" means, and — surprisingly — about a completely alien number system that most people have never heard of. So let's dive in.

---

## 2. Metric Spaces

### Transition: "What does it mean to measure distance?"

### Measuring Distance

Mathematics begins with abstraction. We take a familiar idea — distance — and strip it down to its absolute essentials.

A *metric space* is just a set of points together with a notion of distance. The distance function has to satisfy three rules:

1. The distance between two points is zero if and only if they're the same point.
2. Distance is symmetric — the distance from me to you is the same as the distance from you to me.
3. The triangle inequality — going directly from A to C is never longer than going from A to B and then B to C.

That's it. Any set with a distance function satisfying these three rules is a metric space. It's a remarkably flexible definition.

### Examples

So what are some examples?

- **The number line** — the distance between two numbers is just the absolute value of their difference. Simple.
- **The plane** — the usual Pythagorean distance formula you learned in school.
- **The sphere** — the surface of a ball, where distance is measured along great circles, like the routes that airplanes fly.
- **Trees and graphs** — where distance is the number of edges in the shortest path between two vertices. This one will turn out to be surprisingly important later.

### Rigid Motions

Now here's the key question I want you to think about: what are the *symmetries* of a metric space?

An *isometry* is a way of rearranging all the points of a space that doesn't change the distance between any pair of points. It's a rigid motion — you're allowed to move the space, but you can't stretch or squish it.

The collection of all isometries of a space forms what mathematicians call a *group*. We write it as Isom(X). This is going to be a central character in our story.

### Isometry Groups

Let me give you a feel for what these groups look like:

- For **the line**, the isometries are translations — shifting everything left or right — plus the reflection that flips the whole line around the origin.
- For **the plane**, you get translations, rotations, reflections, and a sneaky one called a "glide reflection" — that's a reflection combined with a translation along the mirror line.
- For **the sphere**, the isometries are rotations and reflections. The full group is called O(3) — the orthogonal group in three dimensions.

The key idea here is that more symmetric spaces have larger isometry groups. And the sphere? The sphere is *very* symmetric.

---

## 3. Groups & Quotients

### Transition: "When symmetries act, new shapes emerge"

### What Is a Group?

Let me say a word about what a "group" actually is, since it's going to be central to everything.

A group is a set with a way of combining elements — you can think of it as "composing symmetries." It needs three properties:

1. Associativity — the order you combine things doesn't matter (as long as you keep the sequence).
2. There's an identity — "doing nothing" is always a valid symmetry.
3. Every symmetry can be undone — every element has an inverse.

The isometries of any metric space naturally form a group. You can compose motions, undo them, and doing nothing is always an option.

### Group Actions

When a group acts on a space, each element of the group moves the points around.

For any starting point, the *orbit* of that point is the set of all places you can get to by applying group elements. It's like asking: "If I keep applying symmetries, where can this point go?"

The *quotient space* X/G is what you get when you glue each orbit down to a single point. It's the space of "essentially different" positions.

### Quotient Examples

This is actually how you build lots of familiar shapes:

- Take the real line and glue together all points that differ by an integer — so 0 is the same as 1, which is the same as 2, and so on. What you get is a **circle**. You've wrapped the line around.
- Do the same thing in two dimensions with a square lattice of translations, and you get a **torus** — a donut shape! The plane gets folded up into a donut.
- Take the sphere and identify every point with its antipodal point — the point on the exact opposite side. You get the **projective plane**, which is this beautiful one-sided surface that can't actually exist in three-dimensional space without crossing itself.

The punchline is that quotients let us build new geometric objects from old ones, using symmetry as the glue.

---

## 4. Rotations of the Sphere

### Transition: "The symmetry group SO(3)"

### The Rotation Group

Now let's zoom in on the sphere and its rotations.

Every rotation of the sphere is determined by two things: an *axis* — a line through the center of the sphere — and an *angle* of rotation around that axis.

The group of all such rotations is called SO(3) — the special orthogonal group. "Special" means we're only allowing rotations, not reflections. Concretely, it's the group of all 3×3 matrices that preserve distances and have determinant 1.

### Rational Rotations

Here's where things start to get interesting. What if we restrict ourselves to rotations whose matrix entries are all *rational numbers* — fractions?

This subgroup, SO(3, ℚ), is still infinite, and it's *dense* in SO(3) — meaning any rotation can be approximated as closely as you like by a rational one. So in some sense, the rational rotations are "almost all" of the rotations.

But here's the key insight: rational numbers can be studied through the lens of *prime numbers*. And this gives these rotations a hidden structure that ordinary rotations don't have.

### An Orbit Mystery

Let's try an experiment. Pick two rotations — call them *a* and *b* — and look at the group they generate: all the ways of combining *a*, *b*, their inverses, over and over.

Now pick any point *p* on the sphere. What does its orbit look like — the set of all points you can reach by applying sequences of *a* and *b*?

If *a* and *b* are "generic enough," the orbit is *dense* — it fills up the entire sphere! Every patch of the sphere, no matter how small, contains orbit points.

But *how* it fills up the sphere is very subtle. To really understand it, we need a completely different kind of number system...

---

## 5. Hidden Geometry — p-adic Numbers

### Transition: "The p-adic world behind rational rotations"

### The p-adic Numbers

The real numbers measure size using the ordinary absolute value. A million is big. A millionth is small. That's our everyday intuition.

But there's a completely different, equally valid way to measure size!

For any prime number *p*, we can define the *p-adic absolute value*. You take a rational number, factor out all the powers of *p*, and the absolute value is *p* raised to the *negative* power.

So for example, a million — which is 2⁶ × 5⁶ — has 2-adic absolute value 2⁻⁶ = 1/64. In the 2-adic world, *a million is tiny* because it's divisible by 2 so many times.

This completely inverts our usual sense of "big" and "small." Numbers that are highly divisible by *p* are considered small.

### A Different World

If you complete the rational numbers with respect to this new notion of distance, you get the *p-adic numbers*, written ℚ_p. These are legitimate number systems, just as valid as the real numbers.

In fact, there's a beautiful theorem due to Ostrowski that says: the real numbers and the *p*-adic numbers, one for each prime, are *all* the ways to complete the rationals. There's nothing else.

The *p*-adic numbers have a tree-like geometry. The "unit ball" in ℚ_p splits into *p* smaller balls, each of which splits into *p* even smaller balls, and so on forever. It's like a fractal tree branching downward.

### The Hidden Action

And here's the magic. A rational rotation — a matrix in SO(3, ℚ) — acts not only on the ordinary round sphere sitting in ℝ³, but also on a *p*-adic sphere for every prime *p*.

The action on the real sphere is just ordinary rotation. But the *p*-adic actions give extra structure — they act on *trees*, providing a hidden combinatorial skeleton.

Think of it like a rotation casting multiple "shadows." One shadow for each prime number. Each shadow reveals a different aspect of the rotation's nature.

### Free Groups and Paradox

A group is called *free* if its elements have no "unexpected" relations. Every product of generators gives you something genuinely new. There are no coincidences.

For most choices of two rotations *a* and *b*, the group they generate is a *free group on two generators*. Every element can be written uniquely as a "word" — a sequence of *a*'s, *b*'s, and their inverses — and no two different words ever give you the same rotation.

The tree-like structure of the *p*-adic world is exactly what lets us prove this freeness. If a group acts on a tree in a way where the generators move in genuinely different directions, they must be free.

And free groups are the engine of the Banach–Tarski paradox.

---

## 6. The Banach–Tarski Paradox

### Transition: "One sphere becomes two"

### A Paradox with the Integers

Before we tackle spheres, let me warm you up with a simpler "paradox."

Take the integers: ..., -2, -1, 0, 1, 2, ... You can split them into even numbers and odd numbers. Each set is "half" the size of the whole.

But the even integers are "the same size" as all the integers! Just multiply by 2 — that's a perfect one-to-one correspondence.

So somehow, *half* of the integers is just as big as all of them. This is only paradoxical because infinite sets don't obey our everyday intuitions about size.

### Free Group Paradox

The free group on two generators has a much more dramatic version of this.

Take all the elements and sort them into four bins based on the first letter of their reduced word: words starting with *a*, words starting with *a*⁻¹, words starting with *b*, and words starting with *b*⁻¹.

Now here's the amazing thing: if you take just the words starting with *a* and multiply them all on the left by *a*⁻¹, the leading *a* gets absorbed, and you get back... *everything else*. All the *b* words, the *b*⁻¹ words, the *a*⁻¹ words, and the identity.

So one-quarter of the group, after a single rotation, becomes three-quarters of the group plus the identity. That's the paradox in its algebraic form.

### From Groups to Spheres

Now we bring it home. Choose two rotations in SO(3) that generate a free group. Their orbits partition almost all of the sphere.

Using the free group decomposition, we can split the sphere into four pieces — one for each type of starting letter.

Then rotating just *two* of those pieces — by *a*⁻¹ and *b*⁻¹ respectively — each reconstructs the entire sphere! Two of the four pieces are each "as big as" the whole thing.

### The Banach–Tarski Paradox

And now the full statement:

**A solid ball in ℝ³ can be decomposed into a *finite number* of pieces which can be reassembled — using only rotations and translations — into *two* solid balls, each the same size as the original.**

One ball becomes two. Same size. No stretching. Just cutting and moving.

### Why Isn't This Nonsense?

So why doesn't this break physics? The answer is that the pieces are *not* ordinary geometric shapes. They're what mathematicians call *non-measurable sets* — sets so complicated that they can't be assigned any well-defined volume. They're constructed using the Axiom of Choice, which is a powerful but non-constructive axiom of set theory.

You can never physically perform this decomposition. The pieces have no volume — not zero volume, *no* volume. The concept just doesn't apply to them.

What this really shows is that not every subset of three-dimensional space can be assigned a volume that's preserved by rigid motions. That's a deep fact about the relationship between geometry and set theory.

The moral: the Banach–Tarski paradox is really a theorem about the *richness of the rotation group*. The sphere has so many symmetries that free groups hide inside SO(3), and free groups can do "paradoxical" things with infinite sets.

### The p-adic Connection

And this brings us full circle. How do we actually *prove* that two specific rotations generate a free group?

We use the *p*-adic action. The strategy is: if a group acts on a tree and two elements move around in genuinely incompatible ways — no common fixed point — then they must generate a free group.

Rational rotations act on *p*-adic trees, and the tree structure makes it straightforward to verify freeness. The "hidden geometry" from the prime numbers provides the scaffolding for the entire paradox.

---

## 7. Summary

### The Big Picture

So let's recap the journey:

1. We started with **metric spaces** — abstracting the idea of distance.
2. We asked about **isometries** — the symmetries that preserve distance.
3. We zoomed in on **rotations** of the sphere — the rich group SO(3).
4. We discovered the **p-adic numbers** — a hidden geometry coming from prime numbers.
5. We saw how the p-adic world gives us **trees**, and trees let us prove free group structure.
6. And finally, free groups give us the **Banach–Tarski paradox** — one ball becomes two.

The through-line is that *symmetry is richer than it appears*. Even something as simple as rotating a ball hides infinite, fractal-like complexity — and that complexity, when harnessed correctly, lets you do things that seem impossible.

### Thank You

Thanks so much for listening! I'm happy to take questions. 🍻
