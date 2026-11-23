import {ARCHIVE_NOTES} from './archive-notes-data.js';

export const ARCHIVE_NOTE_COUNT=ARCHIVE_NOTES.length;
export const ARCHIVE_NOTE_DROP_CHANCE=.35;
const FINAL_ARCHIVE_NOTES=13;
const FINAL_ARCHIVE_NOTE_DROP_CHANCE=.20;

export function archiveNote(id){
 return Number.isInteger(id)?ARCHIVE_NOTES[id-1]:undefined;
}

export function newArchiveNotes(random=Math.random){
 return [ARCHIVE_NOTES[Math.floor(random()*ARCHIVE_NOTE_COUNT)].id];
}

export function initializePlayerArchive(player){
 if(player.archiveNotes===undefined){
  player.archiveNotes=newArchiveNotes();
  player.unreadArchiveNoteIds=[...player.archiveNotes];
 }else player.unreadArchiveNoteIds??=[];
 return player;
}

export function validUnreadArchiveNotes(ids,owned){
 return Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(id=>owned?.includes(id));
}

export function markArchiveNoteSeen(player,id){
 const index=player?.unreadArchiveNoteIds?.indexOf(id)??-1;
 if(index<0)return false;
 player.unreadArchiveNoteIds.splice(index,1);
 return true;
}

export function validArchiveNotes(ids){
 return Array.isArray(ids)&&ids.length>0&&ids.length<=ARCHIVE_NOTE_COUNT
  &&new Set(ids).size===ids.length&&ids.every(id=>Boolean(archiveNote(id)));
}

export function awardArchiveNote(ids,random=Math.random){
 const remaining=ARCHIVE_NOTE_COUNT-ids.length;
 if(remaining<=0)return;
 const chance=remaining<=FINAL_ARCHIVE_NOTES?FINAL_ARCHIVE_NOTE_DROP_CHANCE:ARCHIVE_NOTE_DROP_CHANCE;
 if(random()<chance){
  const available=ARCHIVE_NOTES.filter(note=>!ids.includes(note.id));
  const id=available[Math.floor(random()*available.length)].id;
  ids.push(id);
  return id;
 }
}
