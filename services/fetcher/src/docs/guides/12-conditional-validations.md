# Conditional Validations

| **Condition** | **Validation Rule** |
| --- | --- |
| geo_focus.scope_code = 1 (Global) | Must NOT include regions, countries, or admin1. |
| geo_focus.scope_code = 2 (Regional) | Must include regions. |
| geo_focus.scope_code = 3 (Multi-national) | Must include at least **2 countries**. |
| geo_focus.scope_code = 4 (National) | Must include at least **1 country**. |
| geo_focus.scope_code = 5 (Sub-national) | Must include at least **1 country** and **1 admin1 region**. |
