// Response file/command line argument parser

// Parses a bash style argment string and returns
// and array of strings with the args
function parseArgs(str)
{
    let args = [];
    let arg = null;
    let i = 0;
    while (i < str.length)
    {
        switch (str[i])
        {
            case ' ':
            case '\t':
            case '\n':
            case '\r':
                // White space starts a new arg
                if (arg != null)
                {
                    args.push(arg);
                    arg = null;
                }
                i++;
                break;

            case '\\':
                // Escaped character
                i++;
                if (i < str.length)
                {
                    // Backslash at end of the line terminates the current argument
                    if (str[i] == '\r' || str[i] == '\n')
                    {
                        if (arg != null)
                        {
                            args.push(arg);
                            arg = null;
                        }
                    }
                    else
                    {
                        if (arg == null)
                            arg = "";
                        arg += str[i];
                    }
                }
                i++;
                break;

            case '\'':
            case '\"':
                // Quoted string

                // Store quote kind and skip it
                let quoteKind = str[i];
                i++;

                // We have arg now
                if (arg == null)
                    arg="";

                // Skip string content
                while (i < str.length && str[i] != quoteKind)
                {
                    arg += str[i];
                    i++;
                }

                // Skip the end quote
                if (i < str.length)
                    i++;
                break;

            default:
                if (arg == null)
                    arg = "";
                arg += str[i];
                i++;
                break;

        }
    }

    if (arg != null)
        args.push(arg);

    return args;
}

module.exports = parseArgs;