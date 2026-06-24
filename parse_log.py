with open(r"C:\Users\prave\.gemini\antigravity\brain\355dc856-753a-4c29-92e2-a471dc8c74cc\.system_generated\tasks\task-1206.log", "r", encoding="utf-8") as f:
    content = f.read()

lines = content.splitlines()
failures = []
current_failure = []
in_failure = False

for line in lines:
    if line.startswith("____________________"):
        if current_failure:
            failures.append("\n".join(current_failure))
        current_failure = [line]
        in_failure = True
    elif line.startswith("=========================== short test summary info ============================"):
        if current_failure:
            failures.append("\n".join(current_failure))
        in_failure = False
    elif in_failure:
        current_failure.append(line)

print(f"Total failures: {len(failures)}")
for idx, fail in enumerate(failures):
    flines = fail.splitlines()
    test_name = flines[0]
    # find the line starting with E or containing traceback error
    err_lines = [l for l in flines if l.startswith("E ") or "Error" in l or "Exception" in l]
    safe_name = test_name.encode('ascii', errors='replace').decode('ascii')
    print(f"[{idx+1}] {safe_name}")
    for el in err_lines[-3:]:
        safe_el = el.encode('ascii', errors='replace').decode('ascii')
        print(f"    {safe_el}")
