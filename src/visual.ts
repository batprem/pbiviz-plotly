/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;

import { VisualFormattingSettingsModel } from "./settings";
import { getPyodide, Pyodide } from "./loadPyodide";


// Function to dynamically load an external script (like Plotly.js)
function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve(); // Script is already loaded
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
}

async function prepareData(pyodide: Pyodide) {
    const pythonCode = `
import pandas as pd
import json

# Load the dataset_raw variable from the global scope
dataset_raw = json.loads(globals()['dataset_raw'])


categories = dataset_raw["categories"]
middle_processing = {}
for category in categories:
    column_name = category["source"]["displayName"]
    middle_processing[column_name] = category["values"]

feature_df = pd.DataFrame(middle_processing)
for col in feature_df.columns:
    try:
        feature_df[col] = feature_df[col].astype(int)
        continue
    except ValueError:
        pass
    try:
        feature_df[col] = feature_df[col].astype(float)
        continue
    except ValueError:
        pass

values = dataset_raw.get("values")
if values:
    middle_processing = {}
    for value in values:
        column_name = value["source"]["displayName"]
        middle_processing[column_name] = value["values"]

    values_df = pd.DataFrame(middle_processing)
    for col in values_df.columns:
        try:
            values_df[col] = values_df[col].astype(int)
            continue
        except ValueError:
            pass
        
    color = values_df.iloc[:, 0]
    label_name = values_df.columns[0]
else:
    values_df = None
    color = None
    label_name = None
`
    pyodide.runPython(pythonCode);
}

// Function to generate and render a Plotly chart
async function renderPlotlyChart(container: HTMLElement, pyodide: Pyodide) {
    const pythonCode = `
import plotly.express as px


fig = px.scatter_matrix(feature_df, dimensions=feature_df.columns, color=color, labels={"color": label_name})

# Convert to JSON for JavaScript rendering
fig.update_layout(
    margin=dict(l=20, r=20, t=20, b=20),
    paper_bgcolor="LightSteelBlue",
)
fig.to_json()
    `;

    // Run Python code and get Plotly JSON
    const plotlyJson = pyodide.runPython(pythonCode);

    // Convert JSON string to JavaScript object
    const plotData = JSON.parse(plotlyJson);

    // Render in Power BI using Plotly.js
    await loadScript("https://cdn.plot.ly/plotly-3.0.1.min.js");
    (window as any).Plotly.newPlot(container, plotData.data, plotData.layout);
}


export class Visual implements IVisual {
    private target: HTMLElement;
    private updateCount: number;
    private textNode: Text;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private pyodide: Pyodide;

    constructor(options: VisualConstructorOptions) {
        console.log('Visual constructor', options);
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.updateCount = 0;
    }
    private async initPyodide() {
        this.pyodide = await getPyodide(this.target);
        console.log('Pyodide initialized', this.pyodide);
    }

    public async update(options: VisualUpdateOptions) {
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, options.dataViews[0]);
        if (this.updateCount === 0) {
            await this.initPyodide();
            await this.pyodide.runPythonAsync("print('Hello, world! from pyodide')");
        }

        // Load the data into the pyodide global variable named dataset_raw
        console.log(options)
        this.pyodide.globals.set("dataset_raw", JSON.stringify(options.dataViews[0].categorical));

        // Prepare the data for the chart
        await prepareData(this.pyodide);

        // Render the chart
        await renderPlotlyChart(this.target, this.pyodide);
        
        this.updateCount++;
    }

    /**
     * Returns properties pane formatting model content hierarchies, properties and latest formatting values, Then populate properties pane.
     * This method is called once every time we open properties pane or when the user edit any format property. 
     */
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}