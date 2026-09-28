import http from 'node:http';
import {readFile} from 'node:fs/promises';
import extract from '../api/extract.js';
import plan from '../api/plan.js';
import {geminiReply} from '../tests/fixtures.js';
const demo=process.argv.includes('--demo');
if(demo){
 process.env.GEMINI_API_KEY='local-fixture-only';
 delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;
 globalThis.fetch=async(url,options)=>{
  if(!String(url).startsWith('https://generativelanguage.googleapis.com/'))throw new Error('Demo external request blocked');
  const body=JSON.parse(options.body),prompt=body.contents[0].parts.at(-1).text;
  return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(geminiReply(prompt))}]}}]});
 };
}
const publicFiles={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/extract'||url.pathname==='/api/plan'){
  let chunks='',tooLarge=false;
  for await(const chunk of req){chunks+=chunk;if(chunks.length>50000){tooLarge=true;break;}}
  if(tooLarge){res.writeHead(413);return res.end('Request too large');}
  const result={status(code){res.statusCode=code;return this;},json(data){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));}};
  try{await(url.pathname==='/api/extract'?extract:plan)({method:req.method,body:chunks},result);}
  catch{res.writeHead(500);res.end('Local server error');}
  return;
 }
 if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
 const file=publicFiles[url.pathname];if(!file){res.writeHead(404);return res.end('Not found');}
 try{
  let content=await readFile(new URL('../'+file[0],import.meta.url),'utf8');
  if(demo&&file[0]==='index.html')content=content.replace('<body>','<body><div style="padding:10px;text-align:center;background:#f7e9c8;color:#573f1b;font:13px system-ui">LOCAL PREVIEW · Sample Lisbon recommendations · No live AI or database calls</div>');
  res.setHeader('Content-Type',file[1]+'; charset=utf-8');res.end(content);
 }catch{res.writeHead(500);res.end('Could not read the page');}
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('WanderMap local '+(demo?'fixture preview':'server')+' at http://127.0.0.1:'+(Number(process.env.PORT)||4173)));
