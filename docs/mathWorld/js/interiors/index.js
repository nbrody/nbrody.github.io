/**
 * Interior scene registry.
 *
 * Maps interior IDs (used on `userData.interiorId` of entrance markers)
 * to their constructor class. main.js looks up the id here when the
 * player presses E on an entrance.
 *
 * Each interior class extends InteriorBase — see interiorBase.js for
 * the contract.
 */

import { GratefulDeadArchiveInterior } from './gratefulDeadArchive.js';
import { FacultyOffice412Interior } from './facultyOffice412.js';

export const INTERIORS = {
    gratefulDeadArchive: GratefulDeadArchiveInterior,
    facultyOffice412: FacultyOffice412Interior
};

export { InteriorBase } from './interiorBase.js';
