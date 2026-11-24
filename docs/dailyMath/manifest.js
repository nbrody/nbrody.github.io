/* Daily Math — plate manifest (newest first) */
(function (root) {
  'use strict';

  root.DM_TOPICS = [
    { id: 'geometry',      label: 'Geometry',            light: '#1f4e96', dark: '#76a9fa' },
    { id: 'groups',        label: 'Group theory',        light: '#1b7365', dark: '#5ed4be' },
    { id: 'hyperbolic',    label: 'Hyperbolic geometry', light: '#4a5d73', dark: '#8ea2ba' },
    { id: 'linear',        label: 'Linear algebra',      light: '#6c3d8c', dark: '#c299f2' },
    { id: 'numbers',       label: 'Number theory',       light: '#9e6211', dark: '#e8b85c' },
    { id: 'topology',      label: 'Topology & knots',    light: '#b83b28', dark: '#f27c68' },
    { id: 'dynamics',      label: 'Dynamics',            light: '#1b7365', dark: '#5ed4be' },
    { id: 'symmetry',      label: 'Symmetry & tilings',  light: '#9e6211', dark: '#e8b85c' },
    { id: 'combinatorics', label: 'Combinatorics',       light: '#1f4e96', dark: '#76a9fa' },
  ];

  root.DM_PLATES = [
    {
      plate: '001',
      date: '2026-11-23',
      file: '2026-11-23-poncelets-porism.html',
      title: "Poncelet's Porism",
      hook: 'If one tangent polygon closes between two circles, every starting point closes too.',
      topics: ['geometry', 'dynamics'],
      defaultTheme: 'light',
      form: '2d',
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
