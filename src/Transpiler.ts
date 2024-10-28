import ts, { isCallExpression } from "typescript";

const libFileMap: Record<string, string> = {
  "lib.dom.d.ts": "types/lib.dom.d.ts",
  "lib.dom.iterable.d.ts": "types/lib.dom.iterable.d.ts",
  "ChromeMessenger.d.ts": "types/ChromeMessenger/src/index.d.ts",
  "ChromeMessenger/global.d.ts": "types/ChromeMessenger/src/chrome-global.d.ts",
};

const libFileContentsMap: Record<string, string> = {};

// Function to load a lib file from the extension's types directory
async function loadLibFile(
  fileName: string,
  filePath: string,
  libFileContentsMap: Record<string, string>
): Promise<string | undefined> {
  try {
    const url = chrome.runtime.getURL(filePath);
    const response = await fetch(url);
    if (response.ok) {
      libFileContentsMap[fileName] = await response.text();
    } else {
      console.error(`Failed to load ${filePath}`);
      return undefined;
    }
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error);
    return undefined;
  }
}

async function createInMemoryCompilerHost(
  sourceCode: string
): Promise<ts.CompilerHost> {
  const sourceFile = ts.createSourceFile(
    "input.ts",
    sourceCode,
    ts.ScriptTarget.Latest,
    true
  );

  for (const fileName of Object.entries(libFileMap)) {
    await loadLibFile(fileName[0], fileName[1], libFileContentsMap);
  }

  return {
    getSourceFile: (fileName: string, languageVersion: ts.ScriptTarget) => {
      if (fileName === "input.ts") {
        return sourceFile;
      }
      if (fileName.includes("lib.")) {
        console.log("Loading lib file:", fileName);
        const content = libFileContentsMap[fileName];
        if (content) {
          return ts.createSourceFile(fileName, content, languageVersion);
        }
      }
      if (libFileMap[fileName] !== undefined) {
        console.log(fileName);
        return ts.createSourceFile(fileName, libFileContentsMap[fileName], languageVersion);
      }
      console.warn("[getFileSource]File does not exist:", fileName);
      return undefined;
    },
    writeFile: () => {},
    getDefaultLibFileName: () => "lib.d.ts",
    useCaseSensitiveFileNames: () => false,
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => "",
    getNewLine: () => "\n",
    getDirectories: () => [],
    fileExists: (fileName: string) => {
      if (fileName === "input.ts") {
        return true;
      }
      if (fileName.includes("lib.") || libFileMap[fileName] !== undefined) {
        console.log("Checking for lib file:", fileName);
        const result = libFileMap[fileName] !== undefined;
        if (!result) {
          console.warn("[fileExists]Could not load lib file:", fileName);
        }
        return result;
      }
      console.warn("[fileExists]File does not exist:", fileName);
      return false;
    },
    readFile: (fileName: string) => {
      if (fileName === "input.ts") {
        return sourceCode;
      }
      if (fileName.includes("lib.") || libFileMap[fileName] !== undefined) {
        console.log("Reading lib file:", fileName);
        return libFileContentsMap[fileName];  // Return the actual file contents
      }
      console.warn("[readFile]File does not exist:", fileName);
      return undefined;
    },
  };
}

export function createTransformer(
  typeChecker: ts.TypeChecker
): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const visit: ts.Visitor = (node: ts.Node): ts.Node => {
      if (
        ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)
      ) {
        const type = typeChecker.getTypeAtLocation(node.expression);
        if (type?.symbol !== undefined){
          console.log("visited type:", type?.symbol);
        }
        if (isRipulTransformedType(type)) {
          console.log("Found ripul type", type);
          return ts.factory.createAwaitExpression(node);
        }
      }

      if (isCallExpression(node)) {
        const expressionType = typeChecker.getTypeAtLocation(node);
        if (isRipulTransformedType(expressionType)) {
          console.log("Found ripul type", expressionType);
          return ts.factory.createAwaitExpression(node);
        }
      }

      return ts.visitEachChild(node, visit, context);
    };

    function isRipulTransformedType(type: ts.Type): boolean {
      if (type.symbol?.name.startsWith("ripul_")){
        console.log(type.symbol.name);
        return true;
      }
      return false;
    }

    return (sourceFile) => ts.visitNode(sourceFile, visit) as ts.SourceFile;
  };
}

export async function transpileTypescript(
  codeString: string,
  sourceUrl: string
) {
  const typeChecker = await createTypeChecker(codeString);
  const { outputText } = ts.transpileModule(
    `//\n//\n` + `
/// <reference types="chromemessenger" />
/// <reference types="chromemessenger/global" /> \n` + codeString,
    {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2023,
        inlineSourceMap: true, //Disabled for now, as the maps were mangled, happy to use JS debugging for now
        inlineSources: true,
        sourceMap: true,
      },
      fileName: sourceUrl,
      transformers: {
        before: [createTransformer(typeChecker)],
      },
    }
  );

  // WHY ??
  // the map files are off by 2, so we added two comment lines before transpiling
  // we then trim those lines before gen of dynamic function, so that we correct the off by 2
  return (
    outputText.split("\n").slice(2).join("\n") + "\n//# sourceURL=" + sourceUrl
  );
}

function createProgram(compilerHost: ts.CompilerHost) {
  // Create a program to trigger lib loading
  const program = ts.createProgram({
    rootNames: ["input.ts"],
    options: {
      lib: ["dom", "dom.iterable", "chromemessenger", "chromemessenger/global"],
      types: ["chromemessenger"],
      target: ts.ScriptTarget.ESNext,
    },
    host: compilerHost,
  });
  return program;
}

async function createTypeChecker(
  sourceCode: string
): Promise<ts.TypeChecker> {
  const compilerHost = await createInMemoryCompilerHost(sourceCode);
  const program = createProgram(compilerHost);
  return program.getTypeChecker();
}
