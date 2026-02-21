/**
 * exampleLibrary.js — Preset knot mosaic examples
 * Each example has: name, surface, gridSize/faceSize, and grid data.
 * Tile indices: 0=blank, 1=horiz, 2=vert, 3=arc_ne, 4=arc_nw, 5=arc_se, 6=arc_sw,
 *   7=cross_pos, 8=cross_neg, 9=double_arc_nesw, 10=double_arc_nwse
 */
const EXAMPLES = {
    disk: [
        {
            name: 'Simple Loop',
            gridSize: 3,
            grid: [
                [5, 6, 0],
                [3, 4, 0],
                [0, 0, 0]
            ]
        },
        {
            name: 'Unknot',
            gridSize: 5,
            grid: [
                [0, 0, 0, 0, 0],
                [0, 5, 1, 6, 0],
                [0, 2, 0, 2, 0],
                [0, 3, 1, 4, 0],
                [0, 0, 0, 0, 0]
            ]
        },
        {
            name: 'Figure Eight',
            gridSize: 5,
            grid: [
                [0, 5, 1, 6, 0],
                [5, 8, 10, 7, 6],
                [2, 9, 0, 10, 2],
                [3, 7, 9, 8, 4],
                [0, 3, 1, 4, 0]
            ]
        },
        {
            name: 'Two Loops',
            gridSize: 5,
            grid: [
                [5, 6, 0, 0, 0],
                [3, 4, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 5, 6],
                [0, 0, 0, 3, 4]
            ]
        },
        {
            name: 'Large Unknot',
            gridSize: 7,
            grid: [
                [0, 0, 0, 0, 0, 0, 0],
                [0, 5, 1, 1, 1, 6, 0],
                [0, 2, 0, 0, 0, 2, 0],
                [0, 2, 0, 0, 0, 2, 0],
                [0, 2, 0, 0, 0, 2, 0],
                [0, 3, 1, 1, 1, 4, 0],
                [0, 0, 0, 0, 0, 0, 0]
            ]
        }
    ],
    torus: [
        {
            name: 'Longitude',
            gridSize: 5,
            grid: [
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
                [1, 1, 1, 1, 1],
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0]
            ]
        },
        {
            name: 'Meridian',
            gridSize: 5,
            grid: [
                [0, 0, 2, 0, 0],
                [0, 0, 2, 0, 0],
                [0, 0, 2, 0, 0],
                [0, 0, 2, 0, 0],
                [0, 0, 2, 0, 0]
            ]
        },
        {
            name: '(1,1) Torus Knot',
            gridSize: 3,
            grid: [
                [3, 0, 6],
                [0, 3, 0],
                [6, 0, 3]
            ]
        },
        {
            name: 'Torus Link',
            gridSize: 4,
            grid: [
                [1, 1, 1, 1],
                [0, 0, 0, 0],
                [1, 1, 1, 1],
                [0, 0, 0, 0]
            ]
        },
        {
            name: '(2,3) Torus Knot',
            gridSize: 6,
            grid: [
                [0, 3, 6, 0, 0, 0],
                [0, 0, 0, 3, 6, 0],
                [3, 0, 0, 0, 0, 6],
                [0, 6, 3, 0, 0, 0],
                [0, 0, 0, 6, 3, 0],
                [6, 0, 0, 0, 0, 3]
            ]
        }
    ],
    sphere: [
        {
            name: 'Equator',
            faceSize: 3,
            grid: {
                top: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
                front: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
                right: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
                back: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
                left: [[0, 0, 0], [1, 1, 1], [0, 0, 0]],
                bottom: [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
            }
        },
        {
            name: 'Vertical Loop',
            faceSize: 3,
            grid: {
                top: [[0, 0, 0], [0, 2, 0], [0, 0, 0]],
                front: [[0, 0, 0], [0, 2, 0], [0, 0, 0]],
                right: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
                back: [[0, 0, 0], [0, 2, 0], [0, 0, 0]],
                left: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
                bottom: [[0, 0, 0], [0, 2, 0], [0, 0, 0]]
            }
        },
        {
            name: 'Two Equators',
            faceSize: 4,
            grid: {
                top: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
                front: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [1, 1, 1, 1]],
                right: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [1, 1, 1, 1]],
                back: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [1, 1, 1, 1]],
                left: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [1, 1, 1, 1]],
                bottom: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
            }
        }
    ]
};
