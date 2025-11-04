# Height Reduction Theory for PGL₂(ℚ)

## The General Problem

Given a matrix $M = \begin{pmatrix} a & b \\ c & d \end{pmatrix} \in \text{PGL}_2(\mathbb{Q})$ and a point $[p:q] \in \mathbb{Q}\mathbb{P}^1$ with $\gcd(p,q) = 1$, we want to determine when:

$$h(M \cdot [p:q]) < h([p:q])$$

where $h([p:q]) = \max(|p|, |q|)$ is the **height**.

## The Action

The matrix acts by:
$$M \cdot [p:q] = [ap+bq : cp+dq]$$

After reducing to coprime form $[p':q']$ where $\gcd(p', q') = 1$, the new height is:
$$h([p':q']) = \max(|p'|, |q'|)$$

## Key Insight: The GCD Factor

The crucial observation is that if $g = \gcd(ap+bq, cp+dq) > 1$, then:
- $p' = (ap+bq)/g$ and $q' = (cp+dq)/g$
- The height is reduced by a factor of $g$ (approximately)

Therefore, the reduction region depends on:
1. **Where $g > 1$** (p-adic conditions)
2. **Where the linear combinations are small relative to the original height** (archimedean conditions)

## Systematic Analysis Framework

### Step 1: Identify the GCD Structure

For integers $p, q$, when is $\gcd(ap+bq, cp+dq) > 1$?

**Prime-by-prime analysis:** For each prime $\ell$, the gcd is divisible by $\ell$ when both:
- $ap + bq \equiv 0 \pmod{\ell}$
- $cp + dq \equiv 0 \pmod{\ell}$

This gives a linear system modulo $\ell$:
$$\begin{pmatrix} a & b \\ c & d \end{pmatrix} \begin{pmatrix} p \\ q \end{pmatrix} \equiv \begin{pmatrix} 0 \\ 0 \end{pmatrix} \pmod{\ell}$$

When $\det(M) \not\equiv 0 \pmod{\ell}$, the only solution is $p \equiv q \equiv 0 \pmod{\ell}$.

**But** when working with coprime $[p:q]$ where $\gcd(p,q) = 1$, we cannot have both $p, q$ divisible by $\ell$.

Therefore, for coprime points:
- The gcd gains a factor of $\ell$ when the matrix creates it through the linear combinations
- This happens in **special matrix structures**

### Step 2: Special Matrix Types

#### Type A: Upper Triangular $c = 0$

$$M = \begin{pmatrix} a & b \\ 0 & d \end{pmatrix}, \quad M \cdot [p:q] = [ap+bq : dq]$$

After reduction: $[p':q'] = \left[\frac{ap+bq}{\gcd(ap+bq, dq)} : \frac{dq}{\gcd(ap+bq, dq)}\right]$

**Case A1:** $a = 1, d = 1, b = k \in \mathbb{Z}$
- $M \cdot [p:q] = [p+kq : q]$
- Since $\gcd(p,q) = 1$, we have $\gcd(p+kq, q) = \gcd(p+kq, q) = \gcd(p, q) = 1$
- So $p' = p+kq, q' = q$

**Archimedean analysis:**
- Old height: $h = \max(|p|, |q|)$
- New height: $h' = \max(|p+kq|, |q|)$

For $k > 0$:
- When $p/q < -k$: $p < -kq < 0$, so $h = |p| = -p$
  - $p + kq < 0$, so $|p+kq| = -p - kq < -p = h$
  - $|q| < h$ (since $p < -kq$ means $|p| > k|q| \geq |q|$)
  - **Reduces on $p/q < -k$** ✓

For $k < 0$ (write $k = -m$ where $m > 0$):
- When $p/q > m$: $p > mq > 0$, so $h = p$
  - $p - mq > 0$ and $p - mq < p$
  - $q < p$
  - **Reduces on $p/q > m$** ✓

**Case A2:** $a = 1/\ell, b = 0, d = 1$ (division by prime)
- $M \cdot [p:q] = [p/\ell : q]$
- For coprime result, need $\ell | p$
- After reduction: $[p/\ell : q]$ when $\ell | p$ and $\gcd(p/\ell, q) = 1$

**Combined analysis:**
- Need $v_\ell(p) \geq 1$ (p-adic condition)
- Need $|p/\ell| < \max(|p|, |q|)$, i.e., $\ell \cdot \max(|p/\ell|, |q|) < \max(|p|, |q|)$
- This requires $|p| > |q|$, i.e., $|p/q| > 1$
- **Reduces on: $v_\ell(p) \geq 1$ and $|p/q| > \ell$** ✓

#### Type B: General Case with GCD Creation

$$M = \begin{pmatrix} 1 & 1 \\ -1 & 1 \end{pmatrix}, \quad M \cdot [p:q] = [p+q : -p+q]$$

When are both $p+q$ and $-p+q$ even?
- $p + q \equiv 0 \pmod{2}$ means $p \equiv q \pmod{2}$
- $-p + q \equiv 0 \pmod{2}$ means $p \equiv q \pmod{2}$
- Same condition! So when $p \equiv q \equiv 1 \pmod{2}$ (both odd), we get $\gcd(p+q, -p+q) \geq 2$

**Archimedean check:** After dividing by 2:
- New height $\leq \max(|p+q|/2, |p-q|/2)$
- For odd $p, q$: $|p+q|/2 \approx |p|/2 + |q|/2 < \max(|p|, |q|)$ ✓
- **Reduces on: $p \equiv 1 \pmod{2}$ and $q \equiv 1 \pmod{2}$** ✓

### Step 3: The General Algorithm

For an arbitrary matrix $M = \begin{pmatrix} a & b \\ c & d \end{pmatrix}$:

1. **Check for special structures:**
   - Triangular (c=0 or b=0)
   - Fractional entries (denominators > 1)
   - Specific numerical patterns

2. **Analyze GCD systematically:**
   - For small primes $\ell = 2, 3, 5, 7, \ldots$
   - Check when both $ap+bq \equiv 0 \pmod{\ell}$ and $cp+dq \equiv 0 \pmod{\ell}$
   - This gives congruence conditions on $[p:q]$

3. **Partition by regions:**
   - Divide $\mathbb{Q}\mathbb{P}^1$ into regions based on:
     - Archimedean: $p/q < -1$, $-1 < p/q < 0$, $0 \leq p/q < 1$, $p/q \geq 1$, $\infty$
     - p-adic: congruence classes modulo primes

4. **Test each region:**
   - Sample coprime points from each region
   - Compute new height after matrix action
   - Verify height reduction

5. **Combine conditions:**
   - A region reduces if it satisfies both:
     - The necessary p-adic divisibility
     - The archimedean inequality for height reduction

## Examples

### Example 1: $T = \begin{pmatrix} 1 & 1 \\ 0 & 1 \end{pmatrix}$
- **Type:** Upper triangular, $k = 1$
- **Reduction region:** $p/q < -1$ (archimedean only)

### Example 2: $S = \begin{pmatrix} 0 & -1 \\ 1 & 0 \end{pmatrix}$
- $S \cdot [p:q] = [-q : p]$
- Height: $\max(|q|, |p|)$ = same as original
- **Reduction region:** Empty (just permutes coordinates)

### Example 3: $\begin{pmatrix} 1/2 & 0 \\ 0 & 1 \end{pmatrix}$
- **Type:** Diagonal with fraction
- **Reduction region:** $v_2(p) \geq 1$ (i.e., $p$ even) and $|p/q| > 2$

### Example 4: $\begin{pmatrix} 1 & 1 \\ -1 & 1 \end{pmatrix}$
- **Type:** Creates gcd = 2 for odd points
- **Reduction region:** $p \equiv 1 \pmod{2}$ and $q \equiv 1 \pmod{2}$

## Implementation Strategy

For a computational tool:

1. **Pattern matching:** Check against known matrix types
2. **Empirical testing:** Sample many coprime points from different regions/congruence classes
3. **Refinement:** Use empirical results to hypothesize exact conditions
4. **Verification:** Prove conditions mathematically or test exhaustively

## When No Closed Form Exists

For some matrices, the reduction region may be:
- Very complicated (union of many p-adic conditions)
- Not describable in simple terms
- Best characterized empirically

In these cases, maintain a **lookup table** of tested points or use **sampling-based approximation**.
