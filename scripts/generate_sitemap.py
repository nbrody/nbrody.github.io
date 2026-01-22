import json
import os
import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime

def generate_sitemap(docs_dir, base_url, xml_output, json_output):
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    hierarchy = {}

    for root, dirs, files in os.walk(docs_dir):
        # Skip certain directories
        if 'assets' in dirs:
            dirs.remove('assets')
        if '.git' in dirs:
            dirs.remove('.git')
        
        for file in files:
            if file.endswith(".html"):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, docs_dir)
                
                # XML Logic
                url_path = rel_path.replace(os.sep, '/')
                if url_path == 'index.html':
                    url_link = base_url
                else:
                    url_link = f"{base_url}{url_path}"
                
                url_elem = ET.SubElement(urlset, "url")
                loc = ET.SubElement(url_elem, "loc")
                loc.text = url_link
                
                lastmod = ET.SubElement(url_elem, "lastmod")
                mtime = os.path.getmtime(file_path)
                lastmod.text = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')

                # JSON hierarchy Logic
                parts = rel_path.split(os.sep)
                current = hierarchy
                for part in parts[:-1]:
                    if part not in current:
                        current[part] = {"_type": "folder", "children": {}}
                    current = current[part]["children"]
                
                current[parts[-1]] = {
                    "_type": "file",
                    "name": file,
                    "url": url_path,
                    "mtime": lastmod.text
                }

    # Save XML
    xml_str = ET.tostring(urlset, encoding='utf-8')
    pretty_xml = minidom.parseString(xml_str).toprettyxml(indent="  ")
    with open(xml_output, "w", encoding="utf-8") as f:
        f.write(pretty_xml)

    # Save JSON
    with open(json_output, "w", encoding="utf-8") as f:
        json.dump(hierarchy, f, indent=2)

if __name__ == "__main__":
    PROJECT_ROOT = "/Users/nicbrody/Dropbox/Code/nbrody.github.io"
    DOCS_DIR = os.path.join(PROJECT_ROOT, "docs")
    BASE_URL = "https://nbrody.github.io/"
    XML_FILE = os.path.join(DOCS_DIR, "sitemap.xml")
    JSON_FILE = os.path.join(DOCS_DIR, "sitemap.json")
    
    generate_sitemap(DOCS_DIR, BASE_URL, XML_FILE, JSON_FILE)
    print(f"Sitemap XML generated at {XML_FILE}")
    print(f"Sitemap JSON generated at {JSON_FILE}")
