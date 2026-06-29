// Physical constants, scales, and colors for the Hantek Oscilloscope SPA

export const VERT_VALS = [
    0.001, 0.002, 0.005, 0.010, 0.020, 0.050, 0.100, 0.200, 0.500,
    1.000, 2.000, 5.000, 10.000, 20.000, 50.000, 100.000
];

export const DB_DIVS = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100];

export const HORIZ_VALS = [
    2e-9, 4e-9, 8e-9, 20e-9, 40e-9, 80e-9, 200e-9, 400e-9, 800e-9,
    2e-6, 4e-6, 8e-6, 20e-6, 40e-6, 80e-6, 200e-6, 400e-6, 800e-6,
    2e-3, 4e-3, 8e-3, 20e-3, 40e-3, 80e-3, 200e-3, 400e-3, 800e-3,
    2.0, 4.0, 8.0, 20.0, 40.0
];

export const CHANNEL_COLORS = {
    'CH1': '#00ff66',
    'CH2': '#00e5ff',
    'MATH': '#bd00ff'
};

export const PERSISTENCE_TIME_VALS = [0.0, 0.2, 0.4, 0.8, 1.0, 2.0, 4.0, 8.0, Infinity];
