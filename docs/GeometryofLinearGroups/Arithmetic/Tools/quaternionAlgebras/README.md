# Quaternion Algebras over Number Rings

An interactive tool for exploring quaternion algebras defined via Hilbert symbols over number rings.

## Features

- **Number Ring Definition**: Define a number ring A = ℤ[x₁,...,xₙ]/⟨ideal⟩ using MathQuill input
- **Hilbert Symbol Input**: Enter elements (a,b)_A to define the quaternion algebra
- **Projective Units**: Computes generators for the group of projective units

## Usage

1. **Define the Number Ring**: Enter polynomials in the ideal (e.g., `x^2-2` for ℤ[√2])
2. **Enter Hilbert Symbol**: Input two elements a and b from the ring
3. **Compute**: Click the button to generate the projective unit generators

## Mathematical Background

A quaternion algebra over a number ring A defined by the Hilbert symbol (a,b)_A is the A-algebra with generators i, j, k and relations:
- i² = a
- j² = b
- ij = -ji (equivalently k = ij, k² = -ab)

The **projective units** are elements of reduced norm 1, considered up to multiplication by elements of the center.

## Examples

### Example 1: ℚ(√2)
- Ring: A = ℤ[x]/(x²-2)
- Hilbert symbol: (x, 3)
- Interpretation: The quaternion algebra where i² = √2 and j² = 3

### Example 2: Gaussian integers
- Ring: A = ℤ[x]/(x²+1)
- Hilbert symbol: (x, x)
- Interpretation: The quaternion algebra where i² = j² = √(-1)

## Files

- `index.html` - Main HTML structure
- `styles.css` - Styling and layout
- `main.js` - Mathematical computations and MathQuill integration

## Dependencies

- [MathQuill](http://mathquill.com/) - LaTeX formula editor
- [jQuery](https://jquery.com/) - Required by MathQuill

## Future Enhancements

- Complete implementation of unit group computation for arbitrary number fields
- Explicit relation computation between generators
- Visualization of quaternion multiplication
- Export results in various formats
- Support for more complex ideal definitions
