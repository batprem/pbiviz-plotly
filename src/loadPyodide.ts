export interface Pyodide {
    runPython: (code: string) => any;
    runPythonAsync: (code: string) => Promise<any>;
    loadPackage: (packages: string[]) => Promise<void>;
    pyimport: (module: string) => any;
    globals: any;
    // Extend as needed
}

async function installDependencies(target: HTMLElement, pyodide: Pyodide, packages: string[]) {
    target.innerHTML = `<h2>Installing Python Packages...</h2>
<pre id="status"></pre>`;

    let statusElement = document.getElementById("status");
    statusElement.innerHTML += packages.map(pkg => `${pkg}... installing\n`).join("");

    await pyodide.loadPackage(["micropip"]);
    let micropip = pyodide.pyimport("micropip");
    await Promise.all(packages.map(async pkg => {
        try {
            await micropip.install(pkg);
            statusElement.innerHTML = statusElement.innerHTML.replace(`${pkg}... installing`, `${pkg}... Done ✅\n`);
        } catch (error) {
            statusElement.innerHTML = statusElement.innerHTML.replace(`${pkg}... installing`, `${pkg}... Failed ❌\n`);
            console.error(`Failed to install ${pkg}:`, error);
            throw error;
        }
    }));
}

export async function getPyodide(target: HTMLElement): Promise<Pyodide> {
    // Check if Pyodide is already loaded
    if ((window as any).pyodide) {
        console.log("Pyodide already loaded.");
        return (window as any).pyodide;
    }

    // Load Pyodide script dynamically
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js";
    script.async = true;
    document.head.appendChild(script);

    // Wait for the script to load
    await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Pyodide script"));
    });
    const pyodide = await (window as any).loadPyodide();
    await installDependencies(target, pyodide, ["pandas","plotly"]);

    return pyodide;
}
