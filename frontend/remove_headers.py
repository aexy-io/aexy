
import os
import re

TARGET_DIR = "src/app/(app)"

def remove_header_usage(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Remove import
    # Pattern: import { AppHeader } from "@/components/layout/AppHeader";
    content = re.sub(r'import\s+\{\s*AppHeader\s*\}\s+from\s+"@/components/layout/AppHeader";?\n?', '', content)
    
    # Remove Usage
    # Pattern: <AppHeader ... />
    # We match <AppHeader and closing /> with anything in between, lazy
    content = re.sub(r'^\s*<AppHeader[^>]*/>\s*\n?', '', content, flags=re.MULTILINE)

    with open(file_path, 'w') as f:
        f.write(content)

def main():
    print(f"Scanning {TARGET_DIR}...")
    count = 0
    for root, dirs, files in os.walk(TARGET_DIR):
        for file in files:
            if file.endswith(".tsx") or file.endswith(".jsx"):
                path = os.path.join(root, file)
                # Check if file has AppHeader
                with open(path, 'r') as f:
                    initial_content = f.read()
                
                if "AppHeader" in initial_content:
                    print(f"Modifying {path}")
                    remove_header_usage(path)
                    count += 1
    
    print(f"Modified {count} files.")

if __name__ == "__main__":
    main()
