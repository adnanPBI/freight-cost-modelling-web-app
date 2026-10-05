import { spawn, spawnSync } from 'node:child_process';

function run(command,args){
  const result=spawnSync(command,args,{stdio:'inherit',env:process.env});
  if(result.status!==0) process.exit(result.status??1);
}

run('npm',['run','db:migrate']);
run('npm',['run','db:seed']);

const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start',...process.argv.slice(2)],{
  stdio:'inherit',
  env:process.env
});
for(const signal of ['SIGTERM','SIGINT']){
  process.on(signal,()=>child.kill(signal));
}
child.on('exit',code=>process.exit(code??1));
