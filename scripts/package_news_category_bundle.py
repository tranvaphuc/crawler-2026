from pathlib import Path
import tarfile
root=Path('outputs/news-category-coverage-20261123')
files=['src/newsFlow/categoryCoverage.mjs','src/newsFlow/categoryCoverageWorker.mjs','scripts/apply_news_category_coverage.mjs','test/news-category-coverage.test.mjs']
with tarfile.open(root/'category-runtime.tar.gz','w:gz') as t:
 t.add(root/'runtime-patch.json',arcname='runtime-patch.json')
 for name in files:t.add(name,arcname=name)
print(root/'category-runtime.tar.gz')
