from sample_data import data
import pandas as pd

categories = data["categories"]
middle_processing = {}
for category in categories:
    column_name = category["source"]["displayName"]
    middle_processing[column_name] = category["values"]

df = pd.DataFrame(middle_processing)
print(df)