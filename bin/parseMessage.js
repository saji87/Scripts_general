let fs = require('fs');
let path = require('path');

// Given the content of a text file and a character offset into the file
// return the line number and character position within the line.
function offsetToLine(src, offset)
{
    let lineStartOffset = 0;
    let lineNumber = 0;
    for (let i=0; i<src.length && i<offset; i++)
    {
        if (src[i] == '\r')
        {
            lineNumber++;
            if (i+1 < src.length && src[i+1] == '\n')
                i++;
            lineStartOffset = i + 1;
            continue;
        }
        if (src[i] == '\n')
        {
            lineNumber++;
            lineStartOffset = i + 1;
        }
    }

    return {
        offset: offset,
        line: lineNumber + 1,
        char: offset - lineStartOffset + 1,
    };
}


// Given a VHDL block name and an element, signal etc.. and
// a source file, try to locate that element in the file
function findSourceRefInFile(block, element, sourceFile)
{
    // Load the source
    var src = fs.readFileSync(sourceFile, "utf8");

    // Look for it
    var ret = `(signal(\\s+)${element})|(${element}(\\s*)\:(\\s*)(entity|in|out|inout))`;
    let re = new RegExp(ret);
    let matchIndex = src.search(re);
    if (matchIndex < 0)
        return null;

    // Convert to line number
    var res = offsetToLine(src, matchIndex);

    // Add in the file name
    res.file = sourceFile;
    return res;
}

// Given a VHDL block name and an element, signal etc.. and
// a list of source files, try to locate that element
function findSourceRef(block, element, sourceFiles)
{
    // If the element contains a slash only take the first part before the slash
    // eg: "cpu/u0/IntE_FF1" => "cpu"
    element = element.replace(/\/.*/, "");

    // If the element ends in _NNN where NNN is an integer number then
    // strip it off and use it as an alternate signal name
    // eg: "s_VKSwitches_57" => "s_VKSwitches"
    var altElement = element.replace(/_(\d+)$/, "");

    // Build a list of all possible source files
    let possibleSourceFiles = sourceFiles.filter(x => path.parse(x).name.toLowerCase() == block.toLowerCase());
    for (let i=0; i<possibleSourceFiles.length; i++)
    {
        // Look for the element
        var ref = findSourceRefInFile(block, element, possibleSourceFiles[i]);
        if (ref)
            return ref;

        // Look for the alternate element name
        ref = findSourceRefInFile(block, altElement, possibleSourceFiles[i]);
        if (ref)
            return ref;
    }

    // Not found :(
    return null;
}

// Given a Xilinx error line, extract the entity and block names
function parseBlockAndElementName(str)
{
    // Find the block name
    var blockName = str.match(/in block \<(.+?)\>/i);
    if (!blockName)
        blockName = str.match(/in Unit \<(.+?)\>/i);
    if (!blockName)
        blockName = str.match(/in block \'(.+?)\'/i);
    if (!blockName)
        return null;

    // Find the element name
    var elementName = str.match(/Node \<(.+?)\>/i);
    if (!elementName)
        elementName = str.match(/Signal \'(.+?)\'/i);
    if (!elementName)
        elementName = str.match(/FF\/Latch \<(.+?)\>/i);

    if (!elementName)
        return null;

    // Found it!
    return {
        block: blockName[1],
        element: elementName[1]
    };
}

var reQualifiedMessage = /^(ERROR|WARNING|INFO)\:(.*?)\:(\d+) - \"(.*?)\" Line (\d+)(?:\:|\.) (.*)/i
var reUnqualifiedMessage = /^(ERROR|WARNING|INFO)\:(.*?)\:(\d+) - (.*)/i


// Parses a message line from a Xilinx tool and returns either null
// if it's not an error or warning, else a object with file, line, 
// severity, message and tool
function parseMessage(str, sourceFiles)
{
    // Look for a qualified match
    let m = str.match(reQualifiedMessage);
    if (m != null)
    {
        return {
            file: m[4],
            line: m[5],
            severity: m[1].toLowerCase(),
            tool: m[2],
            code: m[3],
            message: m[6],
        }
    }

    // Look for an unqualified match
    m = str.match(reUnqualifiedMessage);
    if (m != null)
    {
        // Try to get block element name
        var ben = parseBlockAndElementName(m[4]);
        if (ben != null)
        {
            // Try to find source location
            var sr = findSourceRef(ben.block, ben.element, sourceFiles);
            if (sr != null)
            {
                // Found it!
                return {
                    file: sr.file,
                    line: sr.line,
                    severity: m[1].toLowerCase(),
                    tool: m[2],
                    code: m[3],
                    message: m[4],
                };
            }
        }
       
        // Couldn't find source reference location
        return {
            severity: m[1].toLowerCase(),
            tool: m[2],
            code: m[3],
            message: m[4],
        }
    }

    return null;
}


/*
let sourceFiles = [
    "/home/brad/Projects/big80/shared-trs80/Trs80CassetteStreamer.vhd", 
    "/home/brad/Projects/big80/shared-trs80/Trs80KeySwitches.vhd", 
    "/home/brad/Projects/big80/shared-trs80/Trs80CassettePlayer.vhd",
    "/home/brad/Projects/big80/shared-trs80/Trs80CharRom.vhd",
    "/home/brad/Projects/big80/shared/SDCardController.vhd",
    "/home/brad/Projects/big80/boards/mimasv2/99-big80/top.vhd"
];

let messages = [
    "WARNING:Xst:2261 - The FF/Latch <clock_div_limit_2> in Unit <SDCardController> is equivalent to the following 4 FFs/Latches, which will be removed : <clock_div_limit_3> <clock_div_limit_4> <clock_div_limit_5> <clock_div_limit_6>",
    "WARNING:Xst:1710 - FF/Latch <o_sd_op_cmd_0> (without init value) has a constant value of 1 in block <Trs80CassettePlayer>. This FF/Latch will be trimmed during the optimization process.",
    "WARNING:Xst:2677 - Node <s_VKSwitches_57> of sequential type is unconnected in block <Trs80KeySwitches>.",
    "WARNING:Xst:2999 - Signal 'ram', unconnected in block 'Trs80CharRom', is tied to its initial value.",
    "WARNING:Xst:1895 - Due to other FF/Latch trimming, FF/Latch <o_sd_op_cmd_1> (without init value) has a constant value of 0 in block <Trs80CassettePlayer>. This FF/Latch will be trimmed during the optimization process.",
];

for (let i=0; i<messages.length; i++)
{
    console.log(messages[i]);
    console.log(JSON.stringify(parseErrorMessage(messages[i], sourceFiles), null, 4));
}
*/

module.exports = parseMessage;