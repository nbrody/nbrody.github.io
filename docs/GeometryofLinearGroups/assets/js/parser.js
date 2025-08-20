// assets/js/parser.js
(function (w) {
  function latexToParserFormat(latex) {
    let s = latex;

    // Order matters:
    s = s.replace(/\\frac\{(.+?)\}\{(.+?)\}/g, '($1)/($2)');
    s = s.replace(/\\sqrt\[(.+?)\]\{(.+?)\}/g, 'nthRoot($2, $1)');
    s = s.replace(/\\sqrt\{(.+?)\}/g, 'sqrt($1)');
    // Variable x_{k} -> xk
    s = s.replace(/x_\{(.+?)\}/g, 'x$1');
    s = s.replace(/x_(\d+)/g, 'x$1');
    // Trig/log
    s = s.replace(/\\(sin|cos|tan|csc|sec|cot|sinh|cosh|tanh)h?\((.*?)\)/g, '$1($2)');
    s = s.replace(/\\log_\{(.+?)\}\((.+?)\)/g, 'log($2, $1)');
    s = s.replace(/\\ln\((.+?)\)/g, 'log($1)');
    // Symbols
    s = s.replace(/\\pi/g, 'pi');
    s = s.replace(/\\times/g, '*');
    s = s.replace(/\\div/g, '/');
    s = s.replace(/e\^\{(.+?)\}/g, 'exp($1)');
    s = s.replace(/\\left\|(.+?)\\right\|/g, 'abs($1)');
    s = s.replace(/\^\{(.+?)\}/g, '^($1)');
    s = s.replace(/\\left\(/g, '(');
    s = s.replace(/\\right\)/g, ')');

    // Allow ** for exponentiation
    s = s.replace(/\*\*/g, '^');

    return s;
  }

  function setup({ MQ, math, mathField, variablesContainer, resultDiv, getState, setState }) {
    function parseAndEvaluate(latex) {
      const { variableScope } = getState();
      if (latex.trim() === '') {
        resultDiv.textContent = '';
        resultDiv.classList.remove('text-red-500');
        return;
      }
      const parserReady = latexToParserFormat(latex);
      try {
        const result = math.evaluate(parserReady, variableScope);
        const formatted = math.format(result, { precision: 14 });
        resultDiv.textContent = formatted;
        resultDiv.classList.remove('text-red-500');
        resultDiv.classList.add('text-indigo-600');
      } catch (err) {
        resultDiv.textContent = 'Invalid Expression';
        resultDiv.classList.add('text-red-500');
        resultDiv.classList.remove('text-indigo-600');
        console.error('Parsing Error:', err.message, 'Input:', parserReady);
      }
    }

    function reindexVariables() {
      const rows = Array.from(variablesContainer.querySelectorAll('.variable-row'));

      const indexMap = {};
      rows.forEach((row, idx) => {
        const input = row.querySelector('input');
        const oldIdx = parseInt((input?.name || '').replace(/^x/, ''), 10) || (idx + 1);
        indexMap[oldIdx] = idx + 1;
      });

      const newScope = {};
      rows.forEach((row, idx) => {
        const newIdx = idx + 1;
        const newVar = `x${newIdx}`;
        const latexVar = `x_{${newIdx}}`;

        const labelContainer = row.querySelector('.variable-label');
        if (labelContainer) {
          labelContainer.innerHTML = '';
          const span = document.createElement('span');
          labelContainer.appendChild(span);
          MQ.StaticMath(span).latex(latexVar);
        }

        const input = row.querySelector('input');
        if (input) {
          const value = parseFloat(input.value) || 0;
          input.id = newVar;
          input.name = newVar;
          newScope[newVar] = value;
        }

        const delBtn = row.querySelector('button');
        if (delBtn) delBtn.setAttribute('aria-label', `Delete variable ${latexVar}`);
      });

      let latex = mathField.latex();
      Object.keys(indexMap).map(n => +n).sort((a, b) => b - a).forEach(oldIdx => {
        const ni = indexMap[oldIdx];
        if (oldIdx !== ni) {
          const from = `x_{${oldIdx}}`;
          const to = `x_{${ni}}`;
          latex = latex.split(from).join(to);
        }
      });

      setState({ variableScope: newScope, variableCounter: rows.length });
      mathField.latex(latex);
      parseAndEvaluate(latex);
    }

    function addVariableInput() {
      const { variableCounter, variableScope } = getState();
      const next = variableCounter + 1;
      const varName = `x${next}`;
      const latexVar = `x_{${next}}`;

      const container = document.createElement('div');
      container.className = 'variable-row flex items-center space-x-4';

      const labelContainer = document.createElement('div');
      labelContainer.className = 'variable-label flex-shrink-0';
      const labelSpan = document.createElement('span');
      labelContainer.appendChild(labelSpan);
      MQ.StaticMath(labelSpan).latex(latexVar);

      const eq = document.createElement('div');
      eq.className = 'variable-equals flex-shrink-0';
      const eqSpan = document.createElement('span');
      eq.appendChild(eqSpan);
      MQ.StaticMath(eqSpan).latex('=');

      const input = document.createElement('input');
      input.id = varName;
      input.name = varName;
      input.className = 'w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500';
      input.addEventListener('input', () => {
        const st = getState();
        st.variableScope[varName] = parseFloat(input.value) || 0;
        setState(st);
        parseAndEvaluate(mathField.latex());
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'px-2 py-1 text-sm ml-2 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-md transition-colors duration-200';
      del.textContent = 'Delete';
      del.setAttribute('aria-label', `Delete variable ${latexVar}`);
      del.addEventListener('click', () => {
        const st = getState();
        delete st.variableScope[varName];
        setState(st);
        container.remove();
        reindexVariables();
      });

      container.appendChild(labelContainer);
      container.appendChild(eq);
      container.appendChild(input);
      container.appendChild(del);
      variablesContainer.appendChild(container);

      variableScope[varName] = parseFloat(input.value) || 0;
      setState({ variableScope, variableCounter: next });
      parseAndEvaluate(mathField.latex());
    }

    // Hook MathQuill edits
    mathField.config({
      handlers: { edit: () => parseAndEvaluate(mathField.latex()) }
    });

    // Return API so the page can bind buttons etc.
    return { parseAndEvaluate, addVariableInput, reindexVariables, latexToParserFormat };
  }

  w.Parser = { setup };
})(window);