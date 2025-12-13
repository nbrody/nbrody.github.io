$(document).ready(function () {
    var MQ = MathQuill.getInterface(2);

    // --- 1. Polynomial Ring Section ---

    // Define variables input (simple text for now, could be MathQuill if user wants strict mode)
    // but the prompt implies a list of variables.

    // Relations
    var relationFields = [];

    function addRelationField() {
        var container = $('#relations-container');
        var index = relationFields.length;
        var entryDiv = $('<div class="relation-entry"></div>');

        // MathQuill span
        var mqSpan = $('<span class="math-field" style="width: 100%;"></span>');
        entryDiv.append(mqSpan);
        container.append(entryDiv);

        // Initialize MathQuill
        var mathField = MQ.MathField(mqSpan[0], {
            spaceBehavesLikeTab: true,
            handlers: {
                edit: function () {
                    // Could trigger validation or update state here
                }
            },
            placeholder: 'e.g. x^2 + 1 = 0'
        });

        relationFields.push(mathField);

        // Focus new field
        mathField.focus();
    }

    // Add initial relation field
    addRelationField();

    $('#add-relation-btn').click(function () {
        addRelationField();
    });

    // --- 2. Matrix Section ---

    var matrixIds = [
        'matA-00', 'matA-01', 'matA-10', 'matA-11',
        'matB-00', 'matB-01', 'matB-10', 'matB-11'
    ];

    var matrixFields = {};

    matrixIds.forEach(function (id) {
        var el = document.getElementById(id);
        var field = MQ.MathField(el, {
            spaceBehavesLikeTab: true,
            handlers: {
                edit: function () {
                    // console.log(id + ' changed to ' + field.latex());
                },
                enter: function () {
                    // Handle enter key to move to next field
                }
            }
        });
        matrixFields[id] = field;
    });

    // Optional: Add some glassmorphism hover effects via JS if needed, 
    // but CSS hover states handled most of it.
});
