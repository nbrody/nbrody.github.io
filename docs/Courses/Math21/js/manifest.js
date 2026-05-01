/* =============================================================
   Math 21 — Chapter manifest
   Defines the structure of the textbook. Each section points at
   a markdown file under chapters/. Add or reorder freely.
   ============================================================= */

window.MATH21_MANIFEST = {
  course: {
    code: "Math 21",
    title: "Linear Algebra",
    term: "Fall 2026",
    instructor: "Nic Brody",
    institution: "UCSC"
  },
  chapters: [
    {
      id: "ch1",
      number: "1",
      title: "Systems of Linear Equations",
      sections: [
        { id: "1.1", title: "What is a linear equation?", file: "chapters/01-systems/01-what-is-a-linear-equation.md" },
        { id: "1.2", title: "Gaussian Elimination", file: "chapters/01-systems/02-gaussian-elimination.md" },
        { id: "1.3", title: "Reduced Row Echelon Form", file: "chapters/01-systems/03-rref.md" },
        { id: "1.4", title: "Existence and Uniqueness", file: "chapters/01-systems/04-existence-uniqueness.md" }
      ]
    },
    {
      id: "ch2",
      number: "2",
      title: "Matrices",
      sections: [
        { id: "2.1", title: "Matrix Algebra", file: "chapters/02-matrices/01-matrix-algebra.md" },
        { id: "2.2", title: "Matrix Multiplication", file: "chapters/02-matrices/02-matrix-multiplication.md" },
        { id: "2.3", title: "The Inverse of a Matrix", file: "chapters/02-matrices/03-inverse.md" },
        { id: "2.4", title: "LU Factorization", file: "chapters/02-matrices/04-lu-factorization.md" }
      ]
    },
    {
      id: "ch3",
      number: "3",
      title: "Determinants",
      sections: [
        { id: "3.1", title: "The Determinant", file: "chapters/03-determinants/01-determinant.md" },
        { id: "3.2", title: "Cofactor Expansion", file: "chapters/03-determinants/02-cofactor.md" },
        { id: "3.3", title: "Cramer's Rule", file: "chapters/03-determinants/03-cramers-rule.md" }
      ]
    },
    {
      id: "ch4",
      number: "4",
      title: "Vector Spaces",
      sections: [
        { id: "4.1", title: "Abstract Vector Spaces", file: "chapters/04-vector-spaces/01-abstract.md" },
        { id: "4.2", title: "Subspaces", file: "chapters/04-vector-spaces/02-subspaces.md" },
        { id: "4.3", title: "Linear Independence", file: "chapters/04-vector-spaces/03-independence.md" },
        { id: "4.4", title: "Basis and Dimension", file: "chapters/04-vector-spaces/04-basis.md" }
      ]
    },
    {
      id: "ch5",
      number: "5",
      title: "Linear Transformations",
      sections: [
        { id: "5.1", title: "Linear Maps", file: "chapters/05-linear-transformations/01-linear-maps.md" },
        { id: "5.2", title: "Matrix of a Linear Transformation", file: "chapters/05-linear-transformations/02-matrix-of-lt.md" },
        { id: "5.3", title: "Kernel and Image", file: "chapters/05-linear-transformations/03-kernel-image.md" },
        { id: "5.4", title: "Change of Basis", file: "chapters/05-linear-transformations/04-change-of-basis.md" }
      ]
    },
    {
      id: "ch6",
      number: "6",
      title: "Inner Products and Geometry",
      sections: [
        { id: "6.1", title: "The Dot Product", file: "chapters/06-inner-products/01-dot-product.md" },
        { id: "6.2", title: "Inner Product Spaces", file: "chapters/06-inner-products/02-inner-product-spaces.md" },
        { id: "6.3", title: "Orthogonality", file: "chapters/06-inner-products/03-orthogonality.md" },
        { id: "6.4", title: "Gram–Schmidt", file: "chapters/06-inner-products/04-gram-schmidt.md" }
      ]
    },
    {
      id: "ch7",
      number: "7",
      title: "Eigenvalues and Eigenvectors",
      sections: [
        { id: "7.1", title: "Eigenvalues", file: "chapters/07-eigenvalues/01-eigenvalues.md" },
        { id: "7.2", title: "Eigenvectors", file: "chapters/07-eigenvalues/02-eigenvectors.md" },
        { id: "7.3", title: "Diagonalization", file: "chapters/07-eigenvalues/03-diagonalization.md" },
        { id: "7.4", title: "The Spectral Theorem", file: "chapters/07-eigenvalues/04-spectral-theorem.md" }
      ]
    }
  ]
};
