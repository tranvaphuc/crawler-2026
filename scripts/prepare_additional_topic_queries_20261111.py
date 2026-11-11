import json,re,csv,unicodedata
from pathlib import Path
p=Path('outputs/project-refresh-2026-11-10/completion')
def norm(s):return re.sub(r'[^\w]+','',unicodedata.normalize('NFKC',s).casefold())
rows=json.loads((p/'topic-decisions-final.json').read_text(encoding='utf8'))
manual={'Golden Gate Restaurant Group':'Golden Gate Việt Nam nhà hàng','The Golden Spoon':'The Golden Spoon Golden Gate','Goldsun Food/Redsun':'Goldsun Food','Chang':'nhà hàng Chang Thái','Chili Thái':'Chilli Thai','Khrua baan thai':'Khrua Baan Thai','Somtum':'Somtum Thai','Gogi House':'Gogi House','K-pub':'Kpub','Sumo Yakiniku':'Sumo Yakiniku','Mikado':'Mikado sushi','Là Men':'Là Men ramen','Poseidon':'buffet Poseidon','The Coffee House':'The Coffee House','Cheese Coffee':'Cheese Coffee','Katinat':'Katinat','Phê la':'Phê La trà','Universal tea':'Universal Tea','Yu Tang':'Yu Tang','Gongcha':'Gong Cha','Hao Chi':'Hao Chi trà sữa','KOI Thé':'KOI Thé','KFC':'KFC Việt Nam','Popeyes':'Popeyes Việt Nam','Texas Chicken':'Texas Chicken Việt Nam','Bonchon':'Bonchon Việt Nam','Vuvuzela':'Vuvuzela','HK Beer':'HK Beer Việt Nam','iBiero':'iBiero','Bia Sành điệu':'Bia Sành Điệu','Solid Beer Club':'Solid Beer Club'}
abbr={'BDD':'bột ăn dặm','Kem':'kem','NGK':'nước giải khát','PM':'phô mai','SBNL':'sữa','SBTE':'sữa','SCA':'sữa chua','SCU':'sữa chua uống','SCUMS':'sữa chua uống','SCUTT':'sữa chua uống','STC':'sữa trái cây','SDD':'sữa dinh dưỡng','SĐ':'sữa đặc','STV':'sữa hạt','SN':'sữa tươi','GF':'Vinamilk Green Farm','MC':'Mộc Châu Creamery','Susu':'Vinamilk Susu'}
own={'VNM':'Vinamilk','SBDD':'bột dinh dưỡng Vinamilk','NSPN':'Ngôi Sao Phương Nam','chung':'Vinamilk','FM100':'Vinamilk 100%','STTTCreamery':'Mộc Châu Creamery','SCA':'sữa chua','SCU':'sữa chua uống','TPM':'phô mai','NRC':'nước rau củ','Kem':'kem','Đa vị':'Vinamilk','Đạm A2':'Vinamilk A2','9 hạt':'Vinamilk 9 loại hạt','ID/KD':'Vinamilk sữa chua','STC':'sữa trái cây','SCU Tiệt trùng':'sữa chua uống'}
def milk_query(s):
 special={'SBTE_A2 Platinum Premium':'sữa A2 Platinum Premium','Ngành Sữa':'thị trường sữa Việt Nam','Negative Vinamilk':'Vinamilk','Thương hiệu VNM':'Vinamilk','GF_SN':'sữa tươi Vinamilk Green Farm','MC_STTTCreamery':'Mộc Châu Creamery','SCA_VNM Đa vị':'sữa chua Vinamilk đa vị','Kem_VNM Đa vị':'kem Vinamilk đa vị','SCA_ID/KD':'sữa chua ít đường Vinamilk','IDP_Thương hiệu IDP_BRAND':'sữa LOF IDP','FCV_Thương hiệu FCV_BRAND':'FrieslandCampina Việt Nam','Long Thành_Thương hiệu Long Thành_BRAND':'sữa Long Thành','Long Thành_Long Thành SCU_SC_SCU thanh trùng':'sữa chua uống Long Thành','Long Thành_Long Thành thanh trùng_SN_SN thanh trùng':'sữa tươi Long Thành','Heinz_Heinz_BAD':'bột ăn dặm Heinz','Nutifood_Bliss_KEM':'kem Bliss','Nutifood_Celano_KEM':'kem Celano','Nutifood_Merino_KEM':'kem Merino','Unilever_Cornetto_KEM':'kem Cornetto','Unilever_Wall\'s_KEM':'kem Walls'}
 if s in special:return special[s]
 if '_' not in s:return s
 parts=s.split('_');brand=parts[0].strip();product=parts[1].strip()
 if brand in abbr:
  product=own.get(product,product)
  if brand in ['GF','MC','Susu']:return (abbr[brand]+' '+product).strip()
  return abbr[brand]+' '+product+(' Vinamilk' if 'vinamilk' not in product.casefold() else '')
 if product.startswith('Thương hiệu') or product.startswith('Thương Hiệu'):return product.replace('Thương hiệu','').replace('Thương Hiệu','').strip()+' Việt Nam'
 product=product.replace(' Vietnam','').replace(' (RTD)','').replace(' (IFT)','').replace('SC Betagen','Betagen').replace('SCU thanh trùng','sữa chua uống').replace(' thanh trùng',' thanh trùng').replace('SN tiệt trùng','')
 if brand=='FCV':product=product.replace('CGHL','Cô Gái Hà Lan')
 if len(parts)>2 and parts[2].startswith('SB') and not re.search(r'sữa|enfa|friso|nan|aptamil|ensure|pediasure|nutramigen',product,re.I):product='sữa '+product
 if brand=='Nutricare':product=product+' Nutricare'
 if product=='YoGood':product='Betagen YoGood'
 if product=='Sữa chua lên men Đào':product='Sữa chua lên men Đào Đà Lạt Milk'
 return product.strip()
out=[];seen=set()
for r in rows:
 if r['decision']!='EXCLUDED' or r['project'] not in ['Golden Gate Group','Vinamilk']:continue
 s=r['subject'];q=manual.get(s,('nhà hàng '+s if r['project']=='Golden Gate Group' else milk_query(s)))
 if (r['project'],norm(s)) in seen:continue
 seen.add((r['project'],norm(s)));out.append({'project':r['project'],'subject':s,'query':q})
(p/'additional-topic-candidates.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
with (p/'additional-topic-queries.tsv').open('w',encoding='utf8',newline='') as f:
 w=csv.DictWriter(f,fieldnames=['subject','query'],delimiter='\t');w.writeheader();w.writerows({k:x[k] for k in ['subject','query']} for x in out)
print('Additional candidate queries',len(set(x['query'] for x in out)))
