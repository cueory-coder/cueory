import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCK_ID_REGEX = /^(M\d\d|MH\d|MM\d|X1)-L\d\d$/;

/**
 * Basic CSV parser supporting quoted cells with commas and escaped quotes.
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Validate blocks and objectives curriculum files.
 * @param {string} root
 * @returns {{ blocksCount: number, objectivesCount: number }}
 */
export function validateCurriculum(root = DEFAULT_ROOT) {
  const curriculumDir = join(resolve(root), 'content', 'curriculum');
  const blocksPath = join(curriculumDir, 'blocks-v4.csv');
  const objectivesPath = join(curriculumDir, 'objectives-pilot-v4.csv');

  if (!existsSync(blocksPath)) {
    throw new Error(`blocks-v4.csv missing at ${blocksPath}`);
  }
  if (!existsSync(objectivesPath)) {
    throw new Error(`objectives-pilot-v4.csv missing at ${objectivesPath}`);
  }

  const blockRows = parseCsv(readFileSync(blocksPath, 'utf8'));
  const objRows = parseCsv(readFileSync(objectivesPath, 'utf8'));

  if (blockRows.length < 2) throw new Error('blocks-v4.csv has no data rows');
  if (objRows.length < 2) throw new Error('objectives-pilot-v4.csv has no data rows');

  const blockHeader = blockRows[0];
  const blockIdIdx = blockHeader.indexOf('block_id');
  if (blockIdIdx === -1) throw new Error('blocks-v4.csv missing block_id column');

  const knownBlockIds = new Set();
  for (let r = 1; r < blockRows.length; r++) {
    const row = blockRows[r];
    const blockId = row[blockIdIdx];
    if (!blockId) throw new Error(`Row ${r + 1} in blocks-v4.csv has empty block_id`);
    if (!BLOCK_ID_REGEX.test(blockId)) {
      throw new Error(`Invalid block_id format at row ${r + 1}: ${blockId}`);
    }
    if (knownBlockIds.has(blockId)) {
      throw new Error(`Duplicate block_id in blocks-v4.csv: ${blockId}`);
    }
    knownBlockIds.add(blockId);
  }

  const objHeader = objRows[0];
  const objIdIdx = objHeader.indexOf('objective_id');
  const objBlockIdIdx = objHeader.indexOf('block_id');
  const reqBeforeIdx = objHeader.indexOf('required_before');

  if (objIdIdx === -1) throw new Error('objectives-pilot-v4.csv missing objective_id column');
  if (objBlockIdIdx === -1) throw new Error('objectives-pilot-v4.csv missing block_id column');
  if (reqBeforeIdx === -1) throw new Error('objectives-pilot-v4.csv missing required_before column');

  const knownObjIds = new Set();
  const graph = new Map();

  for (let r = 1; r < objRows.length; r++) {
    const row = objRows[r];
    const objId = row[objIdIdx];
    const blockId = row[objBlockIdIdx];

    if (!objId) throw new Error(`Row ${r + 1} in objectives-pilot-v4.csv has empty objective_id`);
    if (knownObjIds.has(objId)) {
      throw new Error(`Duplicate objective_id in objectives-pilot-v4.csv: ${objId}`);
    }
    knownObjIds.add(objId);

    if (!knownBlockIds.has(blockId)) {
      throw new Error(`objective ${objId} references nonexistent block_id: ${blockId}`);
    }

    graph.set(objId, []);
  }

  // Check required_before and verify acyclicity
  for (let r = 1; r < objRows.length; r++) {
    const row = objRows[r];
    const objId = row[objIdIdx];
    const reqBeforeRaw = row[reqBeforeIdx];

    if (reqBeforeRaw && reqBeforeRaw.trim()) {
      if (reqBeforeRaw === 'all of the above') {
        continue;
      }
      const prereqs = reqBeforeRaw.split(',').map((p) => p.trim()).filter(Boolean);
      for (const prereq of prereqs) {
        if (!knownObjIds.has(prereq)) {
          throw new Error(`objective ${objId} required_before references unknown objective: ${prereq}`);
        }
        graph.get(objId).push(prereq);
      }
    }
  }

  // Cycle check using DFS
  const visited = new Map(); // 0 = unvisited, 1 = visiting, 2 = visited
  for (const id of knownObjIds) {
    visited.set(id, 0);
  }

  function hasCycle(node) {
    visited.set(node, 1);
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (visited.get(neighbor) === 1) return true;
      if (visited.get(neighbor) === 0 && hasCycle(neighbor)) return true;
    }
    visited.set(node, 2);
    return false;
  }

  for (const id of knownObjIds) {
    if (visited.get(id) === 0) {
      if (hasCycle(id)) {
        throw new Error(`Cycle detected in curriculum prerequisites involving ${id}`);
      }
    }
  }

  return {
    blocksCount: knownBlockIds.size,
    objectivesCount: knownObjIds.size,
  };
}

// CLI execution
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const result = validateCurriculum();
    console.log(`Curriculum valid: ${result.blocksCount} blocks, ${result.objectivesCount} pilot objectives.`);
  } catch (err) {
    console.error(`Curriculum validation failed: ${err.message}`);
    process.exit(1);
  }
}
