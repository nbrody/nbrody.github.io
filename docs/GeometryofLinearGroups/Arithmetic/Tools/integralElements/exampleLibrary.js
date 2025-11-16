/**
 * Library of example matrix groups
 */

export const exampleLibrary = [
    {
        name: "Magnus curve",
        mats: [
            ['t', '0', '0', '1'],
            ['1', 't', '2', 't^2+1']
        ],
        constants: [
            { label: 't', value: '9' }
        ]
    },
    {
        name: "SL(2,Z)",
        mats: [
            ['1', '1', '0', '1'],
            ['0', '-1', '1', '0']
        ]
    },
    {
        name: "Simple example",
        mats: [
            ['2', '-2', '0', '\\frac{1}{2}'],
            ['3', '4', '2', '3']
        ]
    }
];
