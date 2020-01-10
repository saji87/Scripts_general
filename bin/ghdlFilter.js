const path = require('path');
let misc = require('./misc');

let reMessage = /^(.+?):(\d+):(\d+): (.*)$/;

function ghdl_filter(line)
{
    // Match the line
    let m = line.match(reMessage);
    if (m)
    {
        filename = misc.smartJoin(process.cwd(), m[1]);
        line =`${filename}(${m[2]},${m[3]}) : error 1001 : ${m[4]}`;
        console.log(line);
    }
    else
        console.log(line);
}


async function main(args)
{
    try
    {
        await misc.run(args[0], args.slice(1), null, ghdl_filter);
    }
    catch (err)
    {
        console.error(`${err.message}`);
        process.exit(7);
    }
}

module.exports = main;




