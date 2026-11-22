import {ARCHIVE_NOTES} from './archive-notes-data.js';

export const ARCHIVE_NOTE_COUNT=ARCHIVE_NOTES.length;
export const ARCHIVE_NOTE_DROP_CHANCE=.35;

export function archiveNote(id){
 return Number.isInteger(id)?ARCHIVE_NOTES[id-1]:undefined;
}

export function newArchiveNotes(random=Math.random){
 return [ARCHIVE_NOTES[Math.floor(random()*ARCHIVE_NOTE_COUNT)].id];
}

export function validArchiveNotes(ids){
 return Array.isArray(ids)&&ids.length>0&&ids.length<=ARCHIVE_NOTE_COUNT
  &&new Set(ids).size===ids.length&&ids.every(id=>Boolean(archiveNote(id)));
}

export function awardArchiveNote(ids,random=Math.random){
 if(ids.length<ARCHIVE_NOTE_COUNT&&random()<ARCHIVE_NOTE_DROP_CHANCE){
  const available=ARCHIVE_NOTES.filter(note=>!ids.includes(note.id));
  ids.push(available[Math.floor(random()*available.length)].id);
 }
}
