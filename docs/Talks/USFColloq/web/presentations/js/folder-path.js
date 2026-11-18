// Relative project URLs are shared by the project picker and reel importer.
export function relativeURL(folder, to) {
  const a = folder ? folder.split('/') : [], b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return ('../'.repeat(a.length - i) || './') + b.slice(i).map(encodeURIComponent).join('/');
}
