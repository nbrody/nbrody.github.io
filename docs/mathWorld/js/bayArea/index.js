/**
 * Bay Area Module Index
 * Regional terrain for the SF Bay Area (SF, Berkeley, Oakland, Marin, etc.)
 * Sub-region content modules (UC Berkeley campus, SLMath, SF, etc.)
 * are composed on top of this regional terrain.
 */

export {
    BayAreaTerrain,
    BA_BOUNDS,
    BA_CENTER,
    BA_SIZE,
    gpsToLocal,
    localToGps,
    getElevation,
    isInBay,
    isInPacific
} from './bayArea.js';

// Sub-region content modules (re-exported from their own folders for convenience)
export { UCBerkeleyCampus } from '../berkeley/ucbCampus.js';
