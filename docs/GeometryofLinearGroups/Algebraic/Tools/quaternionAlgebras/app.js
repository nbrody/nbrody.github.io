const form = document.querySelector("#algebra-form");
const statusMessage = document.querySelector("#status-message");
const outputBlock = document.querySelector("#output");
const codeBlock = document.querySelector("#sage-code");
const submitButton = document.querySelector("#submit-button");
const cancelButton = document.querySelector("#cancel-button");
const copyButton = document.querySelector("#copy-code");
const clearOutputButton = document.querySelector("#clear-output");

const hiddenPolynomialInput = document.querySelector("#field-polynomial-hidden");
const hiddenParamAInput = document.querySelector("#param-a-hidden");
const hiddenParamBInput = document.querySelector("#param-b-hidden");

const DEFAULT_CODE_MESSAGE = "// Code will appear here once generated.";
const DEFAULT_OUTPUT_MESSAGE = "// Output from SageMath Cell will appear here.";

const SAGECELL_ENDPOINT = "https://sagecell.sagemath.org/service";

let currentController = null;
let MQ = null;

function setStatus(state, message) {
  statusMessage.className = `status ${state}`;
  statusMessage.textContent = message;
}

function sanitizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function extractBraceGroup(source, startIndex) {
  let index = startIndex;
  while (index < source.length && source[index] === " ") {
    index += 1;
  }
  if (source[index] !== "{") {
    throw new Error("Expected brace group in LaTeX expression.");
  }
  let depth = 0;
  let cursor = index;
  let content = "";
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "{") {
      depth += 1;
      if (depth > 1) {
        content += char;
      }
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { content, endIndex: cursor + 1 };
      }
      content += char;
    } else {
      content += char;
    }
    cursor += 1;
  }
  throw new Error("Unbalanced braces in LaTeX expression.");
}

function replaceFractions(expr) {
  let result = "";
  let cursor = 0;
  while (cursor < expr.length) {
    const fracIndex = expr.indexOf("\\frac", cursor);
    if (fracIndex === -1) {
      result += expr.slice(cursor);
      break;
    }
    result += expr.slice(cursor, fracIndex);
    let nextIndex = fracIndex + "\\frac".length;
    while (expr[nextIndex] === " ") {
      nextIndex += 1;
    }
    const numerator = extractBraceGroup(expr, nextIndex);
    nextIndex = numerator.endIndex;
    while (expr[nextIndex] === " ") {
      nextIndex += 1;
    }
    const denominator = extractBraceGroup(expr, nextIndex);
    nextIndex = denominator.endIndex;
    const num = replaceFractions(numerator.content);
    const den = replaceFractions(denominator.content);
    result += `( ${num} )/( ${den} )`;
    cursor = nextIndex;
  }
  return result;
}

function replaceSquareRoots(expr) {
  let result = "";
  let cursor = 0;
  while (cursor < expr.length) {
    const sqrtIndex = expr.indexOf("\\sqrt", cursor);
    if (sqrtIndex === -1) {
      result += expr.slice(cursor);
      break;
    }
    result += expr.slice(cursor, sqrtIndex);
    let nextIndex = sqrtIndex + "\\sqrt".length;
    while (expr[nextIndex] === " ") {
      nextIndex += 1;
    }
    const radicand = extractBraceGroup(expr, nextIndex);
    nextIndex = radicand.endIndex;
    const inner = replaceSquareRoots(radicand.content);
    result += `sqrt(${inner})`;
    cursor = nextIndex;
  }
  return result;
}

function replaceLatexIdentifiers(expr) {
  const replacements = {
    alpha: "alpha",
    beta: "beta",
    gamma: "gamma",
    delta: "delta",
    epsilon: "epsilon",
    zeta: "zeta",
    eta: "eta",
    theta: "theta",
    iota: "iota",
    kappa: "kappa",
    lambda: "lambda",
    mu: "mu",
    nu: "nu",
    xi: "xi",
    pi: "pi",
    rho: "rho",
    sigma: "sigma",
    tau: "tau",
    upsilon: "upsilon",
    phi: "phi",
    chi: "chi",
    psi: "psi",
    omega: "omega",
    Gamma: "Gamma",
    Delta: "Delta",
    Theta: "Theta",
    Lambda: "Lambda",
    Xi: "Xi",
    Pi: "Pi",
    Sigma: "Sigma",
    Phi: "Phi",
    Psi: "Psi",
    Omega: "Omega",
    sin: "sin",
    cos: "cos",
    tan: "tan",
    cot: "cot",
    sec: "sec",
    csc: "csc",
    log: "log",
    ln: "log",
    exp: "exp",
    det: "det",
    norm: "norm",
    trace: "trace",
  };
  return expr.replace(/\\([a-zA-Z]+)/g, (match, name) => {
    if (name === "frac" || name === "sqrt" || name === "left" || name === "right") {
      return match;
    }
    if (name === "cdot" || name === "times") {
      return match;
    }
    if (name === " " || name === ",") {
      return "";
    }
    if (name === "quad" || name === "qquad" || name === "hspace") {
      return " ";
    }
    if (name === "text") {
      return "";
    }
    return replacements[name] ?? name;
  });
}

function latexToSage(latex) {
  if (!latex) {
    return "";
  }
  let expr = latex.trim();
  expr = replaceFractions(expr);
  expr = replaceSquareRoots(expr);
  expr = expr.replace(/\\left|\\right/g, "");
  expr = expr.replace(/\\cdot/g, "*").replace(/\\times/g, "*");
  expr = expr.replace(/\\pm/g, "+-");
  expr = replaceLatexIdentifiers(expr);
  expr = expr.replace(/\^{([^}]*)}/g, "^($1)");
  expr = expr.replace(/\^([A-Za-z0-9]+)/g, "^($1)");
  expr = expr.replace(/_{([^}]*)}/g, "_$1");
  expr = expr.replace(/\\{/g, "{").replace(/\\}/g, "}");
  expr = expr.replace(/\\%/g, "%");
  expr = expr.replace(/\\#/g, "#");
  expr = expr.replace(/{/g, "(").replace(/}/g, ")");
  expr = expr.replace(/\s+/g, " ");
  expr = expr.replace(/\s*([\+\-\*/^=(),])\s*/g, "$1");
  return expr.trim();
}

function initializeMathQuill() {
  if (!window.MathQuill) {
    console.warn("MathQuill failed to load.");
    return;
  }
  MQ = window.MathQuill.getInterface(2);

  const definitions = [
    {
      editorId: "mq-field-polynomial",
      hiddenInput: hiddenPolynomialInput,
      defaultLatex: "x^{3} - 2",
      placeholder: "x^{3} - 2",
    },
    {
      editorId: "mq-param-a",
      hiddenInput: hiddenParamAInput,
      defaultLatex: "-1",
      placeholder: "-1",
    },
    {
      editorId: "mq-param-b",
      hiddenInput: hiddenParamBInput,
      defaultLatex: "-1",
      placeholder: "-1",
    },
  ];

  definitions.forEach((config) => {
    const element = document.getElementById(config.editorId);
    const hidden = config.hiddenInput;
    if (!element || !hidden) {
      return;
    }

    const mathField = MQ.MathField(element, {
      spaceBehavesLikeTab: true,
      handlers: {
        edit: (field) => {
          const latex = field.latex();
          hidden.dataset.latex = latex;
          try {
            hidden.value = latexToSage(latex);
          } catch (error) {
            console.warn("Failed to convert LaTeX to Sage expression:", error);
            hidden.value = "";
          }
        },
      },
    });
    mathField.latex(config.defaultLatex);
    try {
      hidden.value = latexToSage(mathField.latex());
    } catch (error) {
      console.warn("Failed to initialise MathQuill field:", error);
      hidden.value = "";
    }
    hidden.dataset.latex = mathField.latex();
  });
}

function typesetMath() {
  if (window.MathJax?.startup?.promise) {
    window.MathJax.startup.promise
      .then(() => window.MathJax.typesetPromise?.())
      .catch((error) => {
        console.warn("MathJax startup typeset failed:", error);
      });
    return;
  }
  if (window.MathJax?.typesetPromise) {
    window.MathJax.typesetPromise().catch((error) => {
      console.warn("MathJax typeset failed:", error);
    });
  }
}

function buildSageCode({ polynomial, generator, paramA, paramB, prelude }) {
  const cleanedPrelude = prelude.trim();

  return [
    "# Generated by Quaternion Algebra Unit Group Explorer",
    "from sageall import *",
    "",
    "R.<x> = PolynomialRing(QQ)",
    `poly = R(${JSON.stringify(polynomial)})`,
    `K.<${generator}> = NumberField(poly)`,
    "OK = K.maximal_order()",
    "print(\"Number field:\", K)",
    "print(\"Ring of integers discriminant:\", OK.discriminant())",
    `a_param = K(${JSON.stringify(paramA)})`,
    `b_param = K(${JSON.stringify(paramB)})`,
    "B = QuaternionAlgebra(K, a_param, b_param)",
    "print(\"Quaternion algebra (Hilbert symbol data):\", B)",
    cleanedPrelude ? `${cleanedPrelude}` : "",
    "try:",
    "    O = B.maximal_order()",
    "    print(\"Maximal order discriminant:\", O.discriminant())",
    "except (RuntimeError, ValueError, ArithmeticError) as err:",
    "    print(\"Warning: maximal order computation failed:\")",
    "    print(err)",
    "    O = B.order([B(1), B.gen(0), B.gen(1), B.gen(0)*B.gen(1)])",
    "    print(\"Using the standard order generated by {1, i, j, ij}.\")",
    "U = O.unit_group()",
    "print(\"Unit group rank:\", U.rank())",
    "print(\"Abelian invariants:\", U.abelian_invariants())",
    "print(\"Structure description:\", U.structure_description())",
    "gens = U.gens()",
    "vals = U.gens_values()",
    "for idx, (g, val) in enumerate(zip(gens, vals), 1):",
    "    print(f\"g{idx} (abstract) =\", g)",
    "    print(f\"g{idx} (unit)     =\", val)",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatOutputs({ stdout, stderr }) {
  const chunks = [];
  if (stdout.length) {
    chunks.push(stdout.join(""));
  }
  if (stderr.length) {
    chunks.push("// stderr\n" + stderr.join(""));
  }
  return chunks.length ? chunks.join("\n\n") : "// SageMath Cell returned no output.";
}

async function postJob(code, signal) {
  const body = new URLSearchParams();
  body.set("code", code);
  body.set("lang", "sage");
  body.set("timeout", "60");
  body.set("interacts", "none");

  const response = await fetch(SAGECELL_ENDPOINT, {
    method: "POST",
    body,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to contact SageMath Cell (HTTP ${response.status}).`);
  }

  const payload = await response.json();
  if (!payload.id) {
    const description = payload.error || "No job identifier returned by SageMath Cell.";
    throw new Error(description);
  }

  return payload.id;
}

function collectStream(stream, target) {
  if (!Array.isArray(stream)) {
    return;
  }
  for (const item of stream) {
    if (typeof item === "string") {
      target.push(item);
    } else if (item && typeof item.text === "string") {
      target.push(item.text);
    } else if (item && typeof item.data === "string") {
      target.push(item.data);
    }
  }
}

async function pollJob(id, signal) {
  const stdout = [];
  const stderr = [];
  const errors = [];
  let done = false;

  while (!done) {
    const response = await fetch(
      `${SAGECELL_ENDPOINT}?id=${encodeURIComponent(id)}&timeout=30`,
      { signal }
    );

    if (!response.ok) {
      throw new Error(`Polling failed (HTTP ${response.status}).`);
    }

    const payload = await response.json();

    collectStream(payload.stdout, stdout);
    collectStream(payload.stderr, stderr);
    collectStream(payload.error, errors);

    if (payload.traceback) {
      collectStream(payload.traceback, stderr);
    }

    if (payload.files && payload.files.length) {
      stdout.push(
        "\n// Additional files were generated but are not displayed in this interface.\n"
      );
    }

    if (payload.done === true || payload.status === "done" || payload.success === true) {
      done = true;
    } else if (payload.status === "error") {
      done = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  if (errors.length) {
    stderr.push(...errors);
  }

  return { stdout, stderr };
}

async function runSageComputation(code, signal) {
  const jobId = await postJob(code, signal);
  return pollJob(jobId, signal);
}

function resetOutput() {
  outputBlock.textContent = DEFAULT_OUTPUT_MESSAGE;
}

function resetStatus() {
  setStatus("idle", 'Fill out the form and click "Compute unit group".');
}

resetStatus();
resetOutput();
codeBlock.textContent = DEFAULT_CODE_MESSAGE;

cancelButton.disabled = true;

cancelButton.addEventListener("click", () => {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
  }
});

copyButton?.addEventListener("click", async () => {
  const text = codeBlock.textContent ?? "";
  if (!text || text === DEFAULT_CODE_MESSAGE) {
    return;
  }
  copyButton.disabled = true;
  const originalLabel = copyButton.textContent;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "absolute";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      document.body.removeChild(helper);
    }
    copyButton.textContent = "Copied!";
  } catch (error) {
    console.warn("Clipboard copy failed:", error);
    copyButton.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      copyButton.textContent = originalLabel;
      copyButton.disabled = false;
    }, 1200);
  }
});

clearOutputButton?.addEventListener("click", () => {
  resetOutput();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentController) {
    currentController.abort();
  }

  const formData = new FormData(form);
  const polynomial = sanitizeWhitespace(formData.get("fieldPolynomial") ?? "");
  const generator = (formData.get("fieldGenerator") ?? "").trim();
  const paramA = sanitizeWhitespace(formData.get("paramA") ?? "");
  const paramB = sanitizeWhitespace(formData.get("paramB") ?? "");
  const prelude = formData.get("sagePrelude") ?? "";

  if (!polynomial || !generator || !paramA || !paramB) {
    setStatus("error", "All required fields must be filled in.");
    return;
  }

  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(generator)) {
    setStatus(
      "error",
      "Field generator must start with a letter and contain only letters, digits, or underscores."
    );
    return;
  }

  const sageCode = buildSageCode({ polynomial, generator, paramA, paramB, prelude });
  codeBlock.textContent = sageCode;
  outputBlock.textContent = "// Waiting for SageMath Cell...";

  submitButton.disabled = true;
  cancelButton.disabled = false;
  setStatus("running", "Submitting job to SageMath Cell...");

  const controller = new AbortController();
  currentController = controller;

  try {
    const result = await runSageComputation(sageCode, controller.signal);
    setStatus("success", "Computation finished.");
    outputBlock.textContent = formatOutputs(result);
  } catch (error) {
    if (error.name === "AbortError") {
      setStatus("idle", "Computation was cancelled.");
      resetOutput();
    } else {
      setStatus("error", error.message || "SageMath Cell request failed.");
      outputBlock.textContent = error.stack || error.toString();
    }
  } finally {
    if (currentController === controller) {
      currentController = null;
    }
    submitButton.disabled = false;
    cancelButton.disabled = true;
  }
});

initializeMathQuill();
typesetMath();
