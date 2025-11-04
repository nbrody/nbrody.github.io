// UI management for generator input
let generatorCount = 0;

function renderGenerators() {
    const container = document.getElementById('generators-container');
    let html = '<span class="angle-bracket">⟨</span>';

    for (let i = 1; i <= generatorCount; i++) {
        html += `
            <div class="matrix-wrapper">
                <span class="matrix-paren">(</span>
                <div class="matrix-input">
                    <input type="text" id="g${i}_11" placeholder="a">
                    <input type="text" id="g${i}_12" placeholder="b">
                    <input type="text" id="g${i}_21" placeholder="c">
                    <input type="text" id="g${i}_22" placeholder="d">
                </div>
                <span class="matrix-paren">)</span>
                ${generatorCount > 1 ? `<button class="remove-generator-btn" onclick="removeGenerator(${i})" title="Remove">×</button>` : ''}
            </div>
        `;

        if (i < generatorCount) {
            html += '<span class="comma">,</span>';
        }
    }

    html += '<span class="comma">,</span>';
    html += '<button class="add-generator-btn" onclick="addGenerator()" title="Add generator">+</button>';
    html += '<span class="angle-bracket">⟩</span>';

    container.innerHTML = html;
}

function addGenerator() {
    generatorCount++;
    renderGenerators();
}

function removeGenerator(index) {
    if (generatorCount <= 1) return;

    // Save values of generators after the removed one
    const values = [];
    for (let i = index + 1; i <= generatorCount; i++) {
        values.push({
            a: document.getElementById(`g${i}_11`)?.value || '',
            b: document.getElementById(`g${i}_12`)?.value || '',
            c: document.getElementById(`g${i}_21`)?.value || '',
            d: document.getElementById(`g${i}_22`)?.value || ''
        });
    }

    generatorCount--;
    renderGenerators();

    // Restore values, shifted down by one
    for (let i = 0; i < values.length; i++) {
        const newIndex = index + i;
        if (newIndex <= generatorCount) {
            document.getElementById(`g${newIndex}_11`).value = values[i].a;
            document.getElementById(`g${newIndex}_12`).value = values[i].b;
            document.getElementById(`g${newIndex}_21`).value = values[i].c;
            document.getElementById(`g${newIndex}_22`).value = values[i].d;
        }
    }
}

function loadExample(num) {
    // Reset to 2 generators
    generatorCount = 2;
    renderGenerators();

    if (num === 1) {
        // Modular group: S = ((0,-1),(1,0)), T = ((1,1),(0,1))
        document.getElementById('g1_11').value = '0';
        document.getElementById('g1_12').value = '-1';
        document.getElementById('g1_21').value = '1';
        document.getElementById('g1_22').value = '0';
        document.getElementById('g2_11').value = '1';
        document.getElementById('g2_12').value = '1';
        document.getElementById('g2_21').value = '0';
        document.getElementById('g2_22').value = '1';
    } else if (num === 2) {
        // ((2,0),(0,1)) and ((1,1),(-1,1))
        document.getElementById('g1_11').value = '2';
        document.getElementById('g1_12').value = '0';
        document.getElementById('g1_21').value = '0';
        document.getElementById('g1_22').value = '1';
        document.getElementById('g2_11').value = '1';
        document.getElementById('g2_12').value = '1';
        document.getElementById('g2_21').value = '-1';
        document.getElementById('g2_22').value = '1';
    } else if (num === 3) {
        // ((2,-2),(0,1/2)) and ((3,4),(2,3))
        document.getElementById('g1_11').value = '2';
        document.getElementById('g1_12').value = '-2';
        document.getElementById('g1_21').value = '0';
        document.getElementById('g1_22').value = '1/2';
        document.getElementById('g2_11').value = '3';
        document.getElementById('g2_12').value = '4';
        document.getElementById('g2_21').value = '2';
        document.getElementById('g2_22').value = '3';
    }
}

function getGenerators() {
    const generators = [];
    for (let i = 1; i <= generatorCount; i++) {
        const a = document.getElementById(`g${i}_11`).value;
        const b = document.getElementById(`g${i}_12`).value;
        const c = document.getElementById(`g${i}_21`).value;
        const d = document.getElementById(`g${i}_22`).value;
        generators.push(new Matrix2x2(a, b, c, d));
    }
    return generators;
}

// Initialize on page load
window.onload = () => {
    loadExample(1);
};
