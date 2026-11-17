require('../electron/inputWorker.cjs')
setInterval(()=>process.parentPort.postMessage({type:'pulse',time:performance.now()}),20)
