import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';


const SRC_DIR = 'images';
const OUT_DIR = 'images';
const LQIP_DIR = path.join('images','lqip');


const SIZES = [1600, 800, 400];
const QUALITY = 72; // 画質（お好みで）


async function ensureDir(p){ await fs.mkdir(p, { recursive:true }); }


function extractId(filename){
// bg015.png → 015 / bg_015.png → 015 どちらもOK
const m = filename.match(/bg_?(\d+)\.png$/i);
return m ? m[1] : null;
}


async function processOne(file){
const id = extractId(path.basename(file));
if(!id){ console.log('skip (no id):', file); return; }
const input = path.join(SRC_DIR, file);
const srcBuf = await fs.readFile(input);


// LQIP（24px 幅）
await ensureDir(LQIP_DIR);
const lqipOut = path.join(LQIP_DIR, `bg_${id}_24.webp`);
await sharp(srcBuf).resize({ width:24 }).webp({ quality:QUALITY, effort:4 }).toFile(lqipOut);


// 各サイズのWebP
for(const w of SIZES){
const out = path.join(OUT_DIR, `bg_${id}_${w}.webp`);
await sharp(srcBuf).resize({ width:w }).webp({ quality:QUALITY, effort:4 }).toFile(out);
}
console.log('ok:', id);
}


async function main(){
const files = (await fs.readdir(SRC_DIR)).filter(f=>/^bg_?\d+\.png$/i.test(f)).sort();
if(files.length===0){ console.log('No files like images/bg*.png'); return; }
for(const f of files){ await processOne(f); }
console.log('done.');
}


main().catch(e=>{ console.error(e); process.exit(1); });