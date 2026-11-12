import { presetMatrix } from './presets.js';
/** Clone and validate all matrices before committing any generator edits. */
export function validateGenerators(field,generators) {
  if(!['Q','i','omega'].includes(field)) throw new Error('Choose a supported field first.');
  if(!Array.isArray(generators)||!generators.length) throw new Error('Add at least one generator.');
  const clean=generators.map((row,i)=>{
    if(!Array.isArray(row)||row.length!==4) throw new Error(`Generator ${i+1} needs four entries.`);
    return row.map((value,j)=>{
      const s=String(value??'').trim();
      if(!s) throw new Error(`Generator ${i+1}, entry ${j+1} is empty.`);
      return s;
    });
  });
  const matrices=clean.map((entries,i)=>{
    try {return presetMatrix(field,entries);}
    catch(error){throw new Error(`Generator ${i+1}: ${error.message}`);}
  });
  return {generators:clean,matrices};
}
