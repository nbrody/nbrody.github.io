import os
from datetime import datetime
import xml.etree.ElementTree as ET
from xml.dom import minidom

def generate_sitemap(docs_dir, base_url, output_file):
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")

    for root, dirs, files in os.walk(docs_dir):
        # Skip certain directories if needed
        if 'assets' in dirs:
            dirs.remove('assets')
        
        for file in files:
            if file.endswith(".html"):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, docs_dir)
                
                # Normalize path for URL
                url_path = rel_path.replace(os.sep, '/')
                if url_path == 'index.html':
                    url_path = ''
                elif url_path.endswith('/index.html'):
                    url_path = url_path[:-10]
                
                full_url = f"{base_url}{url_path}"
                
                url_elem = ET.SubElement(urlset, "url")
                loc = ET.SubElement(url_elem, "loc")
                loc.text = full_url
                
                lastmod = ET.SubElement(url_elem, "lastmod")
                mtime = os.path.getmtime(file_path)
                lastmod.text = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')

    # Pretty print XML
    xml_str = ET.tostring(urlset, encoding='utf-8')
    pretty_xml = minidom.parseString(xml_str).toprettyxml(indent="  ")

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(pretty_xml)

if __name__ == "__main__":
    DOCS_DIR = "/Users/nicbrody/Dropbox/Code/nbrody.github.io/docs"
    BASE_URL = "https://nbrody.github.io/"
    OUTPUT_FILE = os.path.join(DOCS_DIR, "sitemap.xml")
    
    generate_sitemap(DOCS_DIR, BASE_URL, OUTPUT_FILE)
    print(f"Sitemap generated at {OUTPUT_FILE}")
