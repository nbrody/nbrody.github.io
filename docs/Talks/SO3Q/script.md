# SO3(Q)

## Section 1

SO_3(Q) is one of my favorite groups

I'd like to describe how geometric, arithmetic, and topological properties make this a beautiful object to study.

We'll begin by studying the group 1 dimension down.

We can consider rotations of the plane that send the standard square grid back to itself.

This is a very constrained set of symmetries. Notice that the length-1 vectors need to have only 4 options for where they can go, and once the first two are determined, the whole thing is decided.

So, SO2Z is a finite group. However, now we can ask the question: what if we only require that, say, one-third of the points mapped to other points, or one-fifth of the points mapped to grid points?

Note, this turns into a question about sending some sub grid to another sub grid

Suddenly, there are way more possibilities! consider the rotation by arccosine of 3/5. This maps a finite index subgroup back to another finite index subgroup, and iterating it does the same.

Now we can ask: what are the possible 2x2 rotation matrices with rational entries? Turns out this is equivalent to having a Pythagorean triple: a² + b² = c². It turns out that we can only do this when the denominator's prime factorization only has primes which are 1 modulo 4.

And, moreover, for a fixed prime, every rotation is a power of a generating one.

We can unravel the structure of SO2Q as consisting of SO2Z, and then for each prime which is 1 modulo 4, we have a generating rotation.

This leads us to a pretty striking observation. Although the obvious geometry of SO2(Q) consists of rational points on a circle, there's a more intrinsic geometry that reflects the algebraic structure of this group.

And this geometry is that of an infinite-dimensional lattice!!

## Section 2

Now let's go up to three dimensions. Again, SO3Z is finite. But now let's consider what an arbitrary 3x3 rotation matrix looks like. We can factor out the denominators and write it as 1/d, with some a's, b's, and c's in the matrix itself. For this to have determinant 1 is equivalent to a² + b² + c² = d². Miraculously, there is a sort of operation on two of these rotations, and we can represent a rotation as an integer quaternion.

This is our first little dictionary to go between primitive integer quaternions and rational rotations.

## Section 3: Subgroups of SO_3(Q)

Three methods for constructing subgroups:
Algebra
Geometry
Arithmetic.

Then expand on each:

Algebra: Choose an axis, and look at the subgroup that fixes that axis

Geometry: Hidden tree geometry! Ping pong in a particular tree.

Arithmetic: Take a subring A of Q, and look at SO_3(A).

Conjecture: That's all!

## Section 4: Towards a classification
