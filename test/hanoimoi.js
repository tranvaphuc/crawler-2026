import fs from "fs/promises";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { HttpsProxyAgent } from "https-proxy-agent";

const BASE_URL = "https://hanoimoi.vn";
const CONCURRENCY = 4;
const MAX_RETRIES_PER_REQUEST = 3;

const listProxy = [
"http://phuctran:qmkxtcjn@160.187.121.79:17277",
"http://phuctran:qmkxtcjn@203.175.97.217:29702",
"http://phuctran:qmkxtcjn@160.187.121.37:13440",
"http://phuctran:qmkxtcjn@157.15.38.100:18639",
"http://phuctran:qmkxtcjn@160.187.121.177:26055",
"http://phuctran:qmkxtcjn@157.66.253.131:21920",
"http://phuctran:qmkxtcjn@203.175.97.125:21383",
"http://phuctran:qmkxtcjn@160.187.121.195:27707",
"http://phuctran:qmkxtcjn@160.22.173.11:11161",
"http://phuctran:qmkxtcjn@160.250.167.244:45570",
"http://phuctran:qmkxtcjn@160.250.166.150:14086",
"http://phuctran:qmkxtcjn@160.22.175.134:22153",
"http://phuctran:qmkxtcjn@160.187.121.98:18998",
"http://phuctran:qmkxtcjn@36.50.175.127:21545",
"http://phuctran:qmkxtcjn@160.22.174.76:17000",
"http://phuctran:qmkxtcjn@157.15.38.161:24061",
"http://phuctran:qmkxtcjn@160.187.120.14:10972",
"http://phuctran:qmkxtcjn@203.175.97.117:20700",
"http://phuctran:qmkxtcjn@160.22.172.25:11790",
"http://phuctran:qmkxtcjn@36.50.175.206:28659",
"http://phuctran:qmkxtcjn@203.175.96.79:16725",
"http://phuctran:qmkxtcjn@160.22.174.60:15561",
"http://phuctran:qmkxtcjn@157.66.253.96:18792",
"http://phuctran:qmkxtcjn@157.15.38.249:32030",
"http://phuctran:qmkxtcjn@160.30.191.176:25950",
"http://phuctran:qmkxtcjn@160.22.172.125:20784",
"http://phuctran:qmkxtcjn@203.175.96.251:32164",
"http://phuctran:qmkxtcjn@160.187.121.150:23652",
"http://phuctran:qmkxtcjn@160.22.175.206:28634",
"http://phuctran:qmkxtcjn@160.187.121.160:24535",
"http://phuctran:qmkxtcjn@160.187.121.0:10117",
"http://phuctran:qmkxtcjn@160.22.174.17:11685",
"http://phuctran:qmkxtcjn@160.250.166.190:17673",
"http://phuctran:qmkxtcjn@157.15.38.181:25858",
"http://phuctran:qmkxtcjn@160.187.120.240:31293",
"http://phuctran:qmkxtcjn@157.66.253.43:14030",
"http://phuctran:qmkxtcjn@160.22.174.102:19326",
"http://phuctran:qmkxtcjn@157.15.39.64:15855",
"http://phuctran:qmkxtcjn@157.15.38.64:15327",
"http://phuctran:qmkxtcjn@157.15.38.26:11957",
"http://phuctran:qmkxtcjn@157.66.253.147:23334",
"http://phuctran:qmkxtcjn@36.50.175.119:20857",
"http://phuctran:qmkxtcjn@157.66.253.120:20941",
"http://phuctran:qmkxtcjn@160.187.120.204:28066",
"http://phuctran:qmkxtcjn@160.22.172.187:26349",
"http://phuctran:qmkxtcjn@160.250.167.8:24398",
"http://phuctran:qmkxtcjn@157.15.38.136:21849",
"http://phuctran:qmkxtcjn@203.175.96.43:13434",
"http://phuctran:qmkxtcjn@160.187.121.131:21944",
"http://phuctran:qmkxtcjn@160.22.173.208:28869",
"http://phuctran:qmkxtcjn@160.250.167.122:34602",
"http://phuctran:qmkxtcjn@160.22.175.194:27612",
"http://phuctran:qmkxtcjn@203.175.96.145:22676",
"http://phuctran:qmkxtcjn@36.50.175.229:30779",
"http://phuctran:qmkxtcjn@160.30.190.199:27478",
"http://phuctran:qmkxtcjn@160.30.191.195:27710",
"http://phuctran:qmkxtcjn@157.15.39.137:22458",
"http://phuctran:qmkxtcjn@160.30.190.91:17824",
"http://phuctran:qmkxtcjn@160.22.174.164:24869",
"http://phuctran:qmkxtcjn@160.30.190.198:27381",
"http://phuctran:qmkxtcjn@160.30.190.110:19496",
"http://phuctran:qmkxtcjn@160.22.173.139:22611",
"http://phuctran:qmkxtcjn@203.175.97.3:10383",
"http://phuctran:qmkxtcjn@160.30.191.124:21309",
"http://phuctran:qmkxtcjn@160.250.167.139:36149",
"http://phuctran:qmkxtcjn@157.15.38.16:11054",
"http://phuctran:qmkxtcjn@160.187.121.53:14898",
"http://phuctran:qmkxtcjn@36.50.175.220:29968",
"http://phuctran:qmkxtcjn@157.15.38.40:13225",
"http://phuctran:qmkxtcjn@160.187.121.60:15531",
"http://phuctran:qmkxtcjn@160.22.172.64:15230",
"http://phuctran:qmkxtcjn@157.66.253.87:17922",
"http://phuctran:qmkxtcjn@203.175.97.120:20968",
"http://phuctran:qmkxtcjn@160.30.190.219:29262",
"http://phuctran:qmkxtcjn@160.22.173.61:15600",
"http://phuctran:qmkxtcjn@157.66.252.226:29895",
"http://phuctran:qmkxtcjn@160.187.120.86:17467",
"http://phuctran:qmkxtcjn@160.22.174.185:26812",
"http://phuctran:qmkxtcjn@160.187.120.215:29056",
"http://phuctran:qmkxtcjn@157.15.39.181:26434",
"http://phuctran:qmkxtcjn@160.187.120.23:11786",
"http://phuctran:qmkxtcjn@160.187.120.5:10109",
"http://phuctran:qmkxtcjn@160.30.190.87:17396",
"http://phuctran:qmkxtcjn@157.66.253.42:13887",
"http://phuctran:qmkxtcjn@203.175.97.72:16654",
"http://phuctran:qmkxtcjn@160.22.175.59:15443",
"http://phuctran:qmkxtcjn@160.22.174.115:20462",
"http://phuctran:qmkxtcjn@160.187.120.234:30785",
"http://phuctran:qmkxtcjn@160.30.191.25:12388",
"http://phuctran:qmkxtcjn@160.22.175.168:25220",
"http://phuctran:qmkxtcjn@160.22.172.34:12580",
"http://phuctran:qmkxtcjn@157.66.253.146:23278",
"http://phuctran:qmkxtcjn@160.22.172.156:23549",
"http://phuctran:qmkxtcjn@203.175.97.128:21693",
"http://phuctran:qmkxtcjn@160.22.172.40:13122",
"http://phuctran:qmkxtcjn@203.175.97.244:32069",
"http://phuctran:qmkxtcjn@157.66.252.202:27762",
"http://phuctran:qmkxtcjn@157.66.253.78:17127",
"http://phuctran:qmkxtcjn@160.30.190.252:32241",
"http://phuctran:qmkxtcjn@160.187.120.48:14012",
"http://phuctran:qmkxtcjn@160.22.173.220:29912",
"http://phuctran:qmkxtcjn@160.30.190.6:10151",
"http://phuctran:qmkxtcjn@157.15.39.129:21739",
"http://phuctran:qmkxtcjn@160.22.174.98:18966",
"http://phuctran:qmkxtcjn@157.66.253.249:32580",
"http://phuctran:qmkxtcjn@160.22.172.16:10939",
"http://phuctran:qmkxtcjn@160.187.120.254:32587",
"http://phuctran:qmkxtcjn@160.187.121.137:22436",
"http://phuctran:qmkxtcjn@160.22.172.12:10580",
"http://phuctran:qmkxtcjn@157.66.252.135:21786",
"http://phuctran:qmkxtcjn@160.22.173.225:30421",
"http://phuctran:qmkxtcjn@160.187.121.68:16277",
"http://phuctran:qmkxtcjn@203.175.96.14:10883",
"http://phuctran:qmkxtcjn@160.22.172.207:28128",
"http://phuctran:qmkxtcjn@160.22.173.4:10496",
"http://phuctran:qmkxtcjn@160.22.173.141:22847",
"http://phuctran:qmkxtcjn@157.15.38.242:31372",
"http://phuctran:qmkxtcjn@160.22.174.34:13230",
"http://phuctran:qmkxtcjn@160.187.120.113:19852",
"http://phuctran:qmkxtcjn@157.66.252.142:22368",
"http://phuctran:qmkxtcjn@160.250.167.166:38586",
"http://phuctran:qmkxtcjn@160.250.167.169:38835",
"http://phuctran:qmkxtcjn@160.30.191.23:12221",
"http://phuctran:qmkxtcjn@160.30.191.110:20010",
"http://phuctran:qmkxtcjn@157.66.252.75:16329",
"http://phuctran:qmkxtcjn@160.22.174.26:12497",
"http://phuctran:qmkxtcjn@203.175.97.91:18300",
"http://phuctran:qmkxtcjn@160.30.190.101:18694",
"http://phuctran:qmkxtcjn@160.250.167.138:36076",
"http://phuctran:qmkxtcjn@160.22.172.238:30935",
"http://phuctran:qmkxtcjn@160.30.190.33:12546",
"http://phuctran:qmkxtcjn@157.15.39.250:32630",
"http://phuctran:qmkxtcjn@203.175.96.147:22795",
"http://phuctran:qmkxtcjn@157.66.252.113:19771",
"http://phuctran:qmkxtcjn@160.250.167.144:36621",
"http://phuctran:qmkxtcjn@160.250.167.203:41937",
"http://phuctran:qmkxtcjn@157.15.38.211:28570",
"http://phuctran:qmkxtcjn@160.22.173.96:18785",
"http://phuctran:qmkxtcjn@160.30.191.98:18911",
"http://phuctran:qmkxtcjn@203.175.96.61:15092",
"http://phuctran:qmkxtcjn@157.15.38.101:18641",
"http://phuctran:qmkxtcjn@160.22.172.81:16816",
"http://phuctran:qmkxtcjn@36.50.175.227:30528",
"http://phuctran:qmkxtcjn@157.66.253.200:28110",
"http://phuctran:qmkxtcjn@203.175.96.229:30193",
"http://phuctran:qmkxtcjn@160.22.174.245:32167",
"http://phuctran:qmkxtcjn@157.15.39.135:22288",
"http://phuctran:qmkxtcjn@36.50.175.177:26026",
"http://phuctran:qmkxtcjn@157.15.39.229:30705",
"http://phuctran:qmkxtcjn@160.30.191.159:24465",
"http://phuctran:qmkxtcjn@160.30.191.93:18533",
"http://phuctran:qmkxtcjn@36.50.175.132:21985",
"http://phuctran:qmkxtcjn@157.15.39.209:28976",
"http://phuctran:qmkxtcjn@203.175.97.218:29774",
"http://phuctran:qmkxtcjn@160.30.190.243:31491",
"http://phuctran:qmkxtcjn@160.250.166.254:23447",
"http://phuctran:qmkxtcjn@157.66.252.164:24354",
"http://phuctran:qmkxtcjn@36.50.175.241:31858",
"http://phuctran:qmkxtcjn@203.175.96.66:15541",
"http://phuctran:qmkxtcjn@36.50.175.144:23138",
"http://phuctran:qmkxtcjn@157.66.253.15:11482",
"http://phuctran:qmkxtcjn@203.175.96.245:31622",
"http://phuctran:qmkxtcjn@157.66.252.47:13783",
"http://phuctran:qmkxtcjn@36.50.175.93:18543",
"http://phuctran:qmkxtcjn@157.66.253.37:13452",
"http://phuctran:qmkxtcjn@157.66.252.100:18574",
"http://phuctran:qmkxtcjn@160.22.172.26:11860",
"http://phuctran:qmkxtcjn@157.15.39.140:22742",
"http://phuctran:qmkxtcjn@203.175.97.173:25730",
"http://phuctran:qmkxtcjn@157.15.38.199:27482",
"http://phuctran:qmkxtcjn@160.187.120.175:25402",
"http://phuctran:qmkxtcjn@203.175.96.25:11842",
"http://phuctran:qmkxtcjn@160.187.121.206:28714",
"http://phuctran:qmkxtcjn@160.22.172.169:24687",
"http://phuctran:qmkxtcjn@157.66.253.118:20747",
"http://phuctran:qmkxtcjn@160.187.121.47:14344",
"http://phuctran:qmkxtcjn@160.30.190.121:20487",
"http://phuctran:qmkxtcjn@203.175.96.165:24483",
"http://phuctran:qmkxtcjn@157.15.39.217:29706",
"http://phuctran:qmkxtcjn@157.15.38.9:10386",
"http://phuctran:qmkxtcjn@160.22.173.63:15770",
"http://phuctran:qmkxtcjn@160.30.190.79:16726",
"http://phuctran:qmkxtcjn@160.250.166.238:22018",
"http://phuctran:qmkxtcjn@160.30.191.212:29219",
"http://phuctran:qmkxtcjn@160.30.191.40:13754",
"http://phuctran:qmkxtcjn@160.187.121.59:15414",
"http://phuctran:qmkxtcjn@157.15.38.19:11285",
"http://phuctran:qmkxtcjn@160.187.121.165:24990",
"http://phuctran:qmkxtcjn@157.66.253.143:23008",
"http://phuctran:qmkxtcjn@203.175.96.107:19191",
"http://phuctran:qmkxtcjn@160.187.120.55:14666",
"http://phuctran:qmkxtcjn@160.30.191.213:29333",
"http://phuctran:qmkxtcjn@160.187.121.172:25570",
"http://phuctran:qmkxtcjn@203.175.97.24:12278",
"http://phuctran:qmkxtcjn@203.175.97.47:14340",
"http://phuctran:qmkxtcjn@157.66.253.234:31187",
"http://phuctran:qmkxtcjn@157.66.252.58:14835",
"http://phuctran:qmkxtcjn@36.50.175.159:24453",
"http://phuctran:qmkxtcjn@157.66.252.117:20136",
"http://phuctran:qmkxtcjn@203.175.97.59:15456",
"http://phuctran:qmkxtcjn@160.187.121.141:22841",
"http://phuctran:qmkxtcjn@160.22.174.183:26628",
"http://phuctran:qmkxtcjn@157.66.252.93:17995",
"http://phuctran:qmkxtcjn@160.30.190.248:31877",
"http://phuctran:qmkxtcjn@160.187.121.111:20134",
"http://phuctran:qmkxtcjn@160.250.166.132:12481",
"http://phuctran:qmkxtcjn@157.15.38.196:27209",
"http://phuctran:qmkxtcjn@160.22.173.62:15672",
"http://phuctran:qmkxtcjn@157.15.39.33:13108",
"http://phuctran:qmkxtcjn@157.15.39.25:12393",
"http://phuctran:qmkxtcjn@160.22.174.44:14066",
"http://phuctran:qmkxtcjn@157.15.39.19:11809",
"http://phuctran:qmkxtcjn@160.250.167.209:42467",
"http://phuctran:qmkxtcjn@157.15.38.126:20931",
"http://phuctran:qmkxtcjn@160.22.172.30:12184",
"http://phuctran:qmkxtcjn@160.250.167.37:26927",
"http://phuctran:qmkxtcjn@160.30.190.186:26320",
"http://phuctran:qmkxtcjn@160.187.121.81:17456",
"http://phuctran:qmkxtcjn@157.66.253.34:13234",
"http://phuctran:qmkxtcjn@160.250.166.131:12401",
"http://phuctran:qmkxtcjn@157.66.252.133:21570",
"http://phuctran:qmkxtcjn@160.22.175.133:22084",
"http://phuctran:qmkxtcjn@160.30.191.4:10486",
"http://phuctran:qmkxtcjn@160.22.173.127:21603",
"http://phuctran:qmkxtcjn@203.175.97.63:15816",
"http://phuctran:qmkxtcjn@157.66.252.120:20363",
"http://phuctran:qmkxtcjn@160.22.174.154:23985",
"http://phuctran:qmkxtcjn@160.22.175.122:21133",
"http://phuctran:qmkxtcjn@157.66.252.165:24430",
"http://phuctran:qmkxtcjn@160.187.120.39:13171",
"http://phuctran:qmkxtcjn@160.250.167.101:32746",
"http://phuctran:qmkxtcjn@160.22.175.76:16971",
"http://phuctran:qmkxtcjn@203.175.97.77:17080",
"http://phuctran:qmkxtcjn@160.22.174.171:25538",
"http://phuctran:qmkxtcjn@203.175.97.90:18221",
"http://phuctran:qmkxtcjn@160.187.120.41:13357",
"http://phuctran:qmkxtcjn@203.175.96.235:30738",
"http://phuctran:qmkxtcjn@160.22.172.135:21635",
"http://phuctran:qmkxtcjn@157.15.38.141:22286",
"http://phuctran:qmkxtcjn@203.175.97.86:17834",
"http://phuctran:qmkxtcjn@157.15.39.108:19814",
"http://phuctran:qmkxtcjn@157.66.252.145:22675",
"http://phuctran:qmkxtcjn@157.15.38.131:21416",
"http://phuctran:qmkxtcjn@160.30.191.184:26712",
"http://phuctran:qmkxtcjn@160.30.190.46:13710",
"http://phuctran:qmkxtcjn@157.66.253.158:24382",
"http://phuctran:qmkxtcjn@203.175.96.93:18002",
"http://phuctran:qmkxtcjn@36.50.175.155:24079",
"http://phuctran:qmkxtcjn@160.22.174.209:28901",
"http://phuctran:qmkxtcjn@157.15.38.90:17697",
"http://phuctran:qmkxtcjn@160.30.191.28:12692",
"http://phuctran:qmkxtcjn@160.22.172.145:22599",
"http://phuctran:qmkxtcjn@160.250.167.212:42726",
"http://phuctran:qmkxtcjn@160.187.121.40:13700",
"http://phuctran:qmkxtcjn@203.175.97.169:25372",
"http://phuctran:qmkxtcjn@203.175.97.26:12500",
"http://phuctran:qmkxtcjn@157.66.253.245:32223",
"http://phuctran:qmkxtcjn@203.175.97.143:22988",
"http://phuctran:qmkxtcjn@157.15.38.179:25668",
"http://phuctran:qmkxtcjn@157.15.39.149:23571",
"http://phuctran:qmkxtcjn@160.22.172.152:23215",
"http://phuctran:qmkxtcjn@203.175.97.115:20506",
"http://phuctran:qmkxtcjn@203.175.97.232:31000",
"http://phuctran:qmkxtcjn@160.30.190.226:29896",
"http://phuctran:qmkxtcjn@160.187.121.12:11212",
"http://phuctran:qmkxtcjn@160.30.191.12:11175",
"http://phuctran:qmkxtcjn@160.30.190.209:28363",
"http://phuctran:qmkxtcjn@160.30.190.77:16506",
"http://phuctran:qmkxtcjn@157.66.253.57:15244",
"http://phuctran:qmkxtcjn@160.30.190.155:23548",
"http://phuctran:qmkxtcjn@160.22.173.104:19526",
"http://phuctran:qmkxtcjn@157.15.39.26:12499",
"http://phuctran:qmkxtcjn@160.30.190.156:23622",
"http://phuctran:qmkxtcjn@160.30.191.138:22594",
"http://phuctran:qmkxtcjn@160.22.175.45:14222",
"http://phuctran:qmkxtcjn@157.66.252.104:18966",
"http://phuctran:qmkxtcjn@160.22.174.144:23086",
"http://phuctran:qmkxtcjn@157.15.39.227:30593",
"http://phuctran:qmkxtcjn@203.175.96.211:28613",
"http://phuctran:qmkxtcjn@157.66.253.162:24720",
"http://phuctran:qmkxtcjn@160.22.174.56:15193",
"http://phuctran:qmkxtcjn@160.187.121.231:30920",
"http://phuctran:qmkxtcjn@203.175.97.121:21011",
"http://phuctran:qmkxtcjn@157.66.252.149:22985",
"http://phuctran:qmkxtcjn@160.22.173.89:18112",
"http://phuctran:qmkxtcjn@160.250.167.156:37641",
"http://phuctran:qmkxtcjn@160.22.172.224:29632",
"http://phuctran:qmkxtcjn@203.175.96.253:32321",
"http://phuctran:qmkxtcjn@160.30.190.73:16195",
"http://phuctran:qmkxtcjn@160.22.174.65:15941",
"http://phuctran:qmkxtcjn@203.175.96.24:11757",
"http://phuctran:qmkxtcjn@157.66.252.50:14052",
"http://phuctran:qmkxtcjn@160.22.172.165:24336",
"http://phuctran:qmkxtcjn@160.22.175.30:12813",
"http://phuctran:qmkxtcjn@157.66.252.90:17731",
"http://phuctran:qmkxtcjn@203.175.97.153:23928",
"http://phuctran:qmkxtcjn@157.66.252.73:16195",
"http://phuctran:qmkxtcjn@160.30.191.101:19208",
"http://phuctran:qmkxtcjn@160.187.121.176:25954",
"http://phuctran:qmkxtcjn@157.15.39.23:12218",
"http://phuctran:qmkxtcjn@160.22.173.123:21173",
"http://phuctran:qmkxtcjn@160.30.190.123:20705",
"http://phuctran:qmkxtcjn@160.250.167.62:29244",
"http://phuctran:qmkxtcjn@160.30.191.41:13839",
"http://phuctran:qmkxtcjn@160.30.191.126:21440",
"http://phuctran:qmkxtcjn@160.22.172.179:25627",
"http://phuctran:qmkxtcjn@203.175.97.195:27681",
"http://phuctran:qmkxtcjn@203.175.96.244:31530",
"http://phuctran:qmkxtcjn@160.30.190.132:21456",
"http://phuctran:qmkxtcjn@203.175.97.13:11281",
"http://phuctran:qmkxtcjn@203.175.97.216:29604",
"http://phuctran:qmkxtcjn@160.22.172.61:15018",
"http://phuctran:qmkxtcjn@157.66.253.174:25816",
"http://phuctran:qmkxtcjn@157.66.253.188:27037",
"http://phuctran:qmkxtcjn@157.66.253.77:17085",
"http://phuctran:qmkxtcjn@160.30.190.89:17630",
"http://phuctran:qmkxtcjn@157.15.38.62:15143",
"http://phuctran:qmkxtcjn@203.175.96.78:16614",
"http://phuctran:qmkxtcjn@160.22.172.213:28682",
"http://phuctran:qmkxtcjn@160.22.174.125:21344",
"http://phuctran:qmkxtcjn@160.250.167.236:44874",
"http://phuctran:qmkxtcjn@160.187.121.104:19483",
"http://phuctran:qmkxtcjn@160.30.190.13:10728",
"http://phuctran:qmkxtcjn@160.22.172.60:14923",
"http://phuctran:qmkxtcjn@160.187.120.183:26119",
"http://phuctran:qmkxtcjn@160.187.120.124:20885",
"http://phuctran:qmkxtcjn@160.22.173.79:17201",
"http://phuctran:qmkxtcjn@157.66.253.217:29634",
"http://phuctran:qmkxtcjn@203.175.97.130:21826",
"http://phuctran:qmkxtcjn@203.175.96.117:20100",
"http://phuctran:qmkxtcjn@160.187.120.117:20229",
"http://phuctran:qmkxtcjn@203.175.96.94:18016",
"http://phuctran:qmkxtcjn@160.187.120.216:29148",
"http://phuctran:qmkxtcjn@157.15.38.124:20790",
"http://phuctran:qmkxtcjn@160.22.174.116:20617",
"http://phuctran:qmkxtcjn@203.175.97.150:23641",
"http://phuctran:qmkxtcjn@160.22.174.124:21338",
"http://phuctran:qmkxtcjn@157.66.252.231:30378",
"http://phuctran:qmkxtcjn@157.66.253.103:19388",
"http://phuctran:qmkxtcjn@157.15.39.210:29045",
"http://phuctran:qmkxtcjn@160.22.175.80:17294",
"http://phuctran:qmkxtcjn@160.250.167.104:32996",
"http://phuctran:qmkxtcjn@160.187.120.122:20692",
"http://phuctran:qmkxtcjn@160.187.120.104:19056",
"http://phuctran:qmkxtcjn@157.66.252.192:26898",
"http://phuctran:qmkxtcjn@160.187.120.16:11111",
"http://phuctran:qmkxtcjn@36.50.175.110:19996",
"http://phuctran:qmkxtcjn@160.250.167.94:32060",
"http://phuctran:qmkxtcjn@157.66.252.193:26933",
"http://phuctran:qmkxtcjn@160.22.174.62:15675",
"http://phuctran:qmkxtcjn@157.15.39.154:23953",
"http://phuctran:qmkxtcjn@160.22.173.24:12294",
"http://phuctran:qmkxtcjn@157.15.38.117:20163",
"http://phuctran:qmkxtcjn@160.22.174.85:17816",
"http://phuctran:qmkxtcjn@160.187.120.162:24306",
"http://phuctran:qmkxtcjn@157.66.252.250:32071",
"http://phuctran:qmkxtcjn@157.66.253.47:14390",
"http://phuctran:qmkxtcjn@160.22.174.170:25467",
"http://phuctran:qmkxtcjn@160.30.191.139:22679",
"http://phuctran:qmkxtcjn@160.22.172.211:28480",
"http://phuctran:qmkxtcjn@160.22.172.240:31071",
"http://phuctran:qmkxtcjn@157.15.39.93:18518",
"http://phuctran:qmkxtcjn@160.30.191.205:28546",
"http://phuctran:qmkxtcjn@160.30.190.116:20021",
"http://phuctran:qmkxtcjn@160.187.120.43:13525",
"http://phuctran:qmkxtcjn@160.30.190.126:20891",
"http://phuctran:qmkxtcjn@157.15.39.18:11758",
"http://phuctran:qmkxtcjn@160.22.172.33:12460",
"http://phuctran:qmkxtcjn@160.22.174.74:16776",
"http://phuctran:qmkxtcjn@160.22.175.108:19816",
"http://phuctran:qmkxtcjn@160.187.120.103:18922",
"http://phuctran:qmkxtcjn@160.22.172.11:10474",
"http://phuctran:qmkxtcjn@160.22.172.23:11583",
"http://phuctran:qmkxtcjn@36.50.175.224:30259",
"http://phuctran:qmkxtcjn@160.250.167.184:40208",
"http://phuctran:qmkxtcjn@157.15.39.144:23132",
"http://phuctran:qmkxtcjn@160.30.191.22:12125",
"http://phuctran:qmkxtcjn@160.22.173.53:14908",
"http://phuctran:qmkxtcjn@160.22.175.113:20303",
"http://phuctran:qmkxtcjn@203.175.97.192:27433",
"http://phuctran:qmkxtcjn@160.22.173.38:13599",
"http://phuctran:qmkxtcjn@160.22.174.15:11502",
"http://phuctran:qmkxtcjn@160.30.191.252:32797",
"http://phuctran:qmkxtcjn@160.187.120.166:24637",
"http://phuctran:qmkxtcjn@157.66.252.188:26489",
"http://phuctran:qmkxtcjn@36.50.175.168:25272",
"http://phuctran:qmkxtcjn@203.175.97.106:19692",
"http://phuctran:qmkxtcjn@160.187.121.89:18166",
"http://phuctran:qmkxtcjn@157.66.253.38:13575",
"http://phuctran:qmkxtcjn@160.22.172.86:17248",
"http://phuctran:qmkxtcjn@203.175.97.88:18073",
"http://phuctran:qmkxtcjn@36.50.175.212:29235",
"http://phuctran:qmkxtcjn@160.22.173.97:18839",
"http://phuctran:qmkxtcjn@160.187.120.139:22180",
"http://phuctran:qmkxtcjn@203.175.97.206:28662",
"http://phuctran:qmkxtcjn@160.250.166.113:10804",
"http://phuctran:qmkxtcjn@160.22.172.192:26753",
"http://phuctran:qmkxtcjn@203.175.97.92:18409",
"http://phuctran:qmkxtcjn@160.250.167.179:39712",
"http://phuctran:qmkxtcjn@160.30.190.55:14556"
];

const CATEGORY_URLS = [
  "https://hanoimoi.vn/daihoidang",
  "https://hanoimoi.vn/daihoidang/lich-su-cac-ky-dai-hoi-dang",
  "https://hanoimoi.vn/daihoidang/dai-hoi-lan-thu-xviii-dang-bo-tp-ha-noi",
  "https://hanoimoi.vn/daihoidang/dai-hoi-xiv-cua-dang",
  "https://hanoimoi.vn/daihoidang/multimedia",
  "https://hanoimoi.vn/daihoidang/hoat-dong-cua-dang-bo-tp-ha-noi",
  "https://hanoimoi.vn/daihoidang/goc-nhin-binh-luan",
  "https://hanoimoi.vn/daihoidang/tu-lieu-van-kien",
  "https://hanoimoi.vn/daihoidang/hoi-dap",
  "https://hanoimoi.vn/chinh-tri",
  "https://hanoimoi.vn/chinh-tri/doi-ngoai",
  "https://hanoimoi.vn/chinh-tri/nhan-su",
  "https://hanoimoi.vn/chinh-tri/xay-chong",
  "https://hanoimoi.vn/chinh-tri/nghi-quyet-va-cuoc-song",
  "https://hanoimoi.vn/chinh-tri/cai-cach-hanh-chinh",
  "https://hanoimoi.vn/chinh-tri/bao-ve-nen-tang-tu-tuong-cua-dang",
  "https://hanoimoi.vn/kinh-te",
  "https://hanoimoi.vn/kinh-te/thi-truong",
  "https://hanoimoi.vn/kinh-te/tai-chinh",
  "https://hanoimoi.vn/kinh-te/dau-tu",
  "https://hanoimoi.vn/do-thi",
  "https://hanoimoi.vn/do-thi/bat-dong-san",
  "https://hanoimoi.vn/do-thi/giao-thong",
  "https://hanoimoi.vn/do-thi/xay-dung",
  "https://hanoimoi.vn/do-thi/moi-truong",
  "https://hanoimoi.vn/do-thi/quy-hoach",
  "https://hanoimoi.vn/do-thi/kien-truc",
  "https://hanoimoi.vn/van-hoa",
  "https://hanoimoi.vn/van-hoa/giai-tri",
  "https://hanoimoi.vn/van-hoa/van-nghe",
  "https://hanoimoi.vn/van-hoa/cong-nghiep-van-hoa",
  "https://hanoimoi.vn/van-hoa/sach",
  "https://hanoimoi.vn/van-hoa/the-thao",
  "https://hanoimoi.vn/xa-hoi",
  "https://hanoimoi.vn/xa-hoi/chong-lang-phi",
  "https://hanoimoi.vn/xa-hoi/lao-dong-viec-lam",
  "https://hanoimoi.vn/xa-hoi/luong-bao-hiem",
  "https://hanoimoi.vn/xa-hoi/phong-chay-chua-chay",
  "https://hanoimoi.vn/xa-hoi/dan-hoi-chinh-quyen-tra-loi",
  "https://hanoimoi.vn/xa-hoi/trai-tim-nhan-ai",
  "https://hanoimoi.vn/giao-duc",
  "https://hanoimoi.vn/giao-duc/tuyen-sinh",
  "https://hanoimoi.vn/giao-duc/du-hoc",
  "https://hanoimoi.vn/y-te",
  "https://hanoimoi.vn/y-te/suc-khoe",
  "https://hanoimoi.vn/y-te/an-toan-thuc-pham",
  "https://hanoimoi.vn/the-gioi",
  "https://hanoimoi.vn/the-gioi/diem-nong",
  "https://hanoimoi.vn/the-gioi/chuyen-do-day",
  "https://hanoimoi.vn/the-gioi/ho-so",
  "https://hanoimoi.vn/the-gioi/nguoi-viet-bon-phuong",
  "https://hanoimoi.vn/the-gioi/luan-dam-thoi-su",
  "https://hanoimoi.vn/du-lich",
  "https://hanoimoi.vn/du-lich/diem-den",
  "https://hanoimoi.vn/du-lich/am-thuc",
  "https://hanoimoi.vn/nong-nghiep-nong-thon",
  "https://hanoimoi.vn/nong-nghiep-nong-thon/nong-nghiep",
  "https://hanoimoi.vn/nong-nghiep-nong-thon/nong-thon-moi",
  "https://hanoimoi.vn/nong-nghiep-nong-thon/ocop-ha-noi",
  "https://hanoimoi.vn/khoa-hoc-cong-nghe",
  "https://hanoimoi.vn/khoa-hoc-cong-nghe/chuyen-doi-so",
  "https://hanoimoi.vn/khoa-hoc-cong-nghe/xe",
  "https://hanoimoi.vn/khoa-hoc-cong-nghe/san-pham-moi",
  "https://hanoimoi.vn/doi-song",
  "https://hanoimoi.vn/doi-song/gioi-tre",
  "https://hanoimoi.vn/doi-song/gia-dinh",
  "https://hanoimoi.vn/doi-song/ky-nang-song",
  "https://hanoimoi.vn/ha-noi-ket-noi",
  "https://hanoimoi.vn/ha-noi-ket-noi/tp-ho-chi-minh",
  "https://hanoimoi.vn/ha-noi-ket-noi/vung-dong-bang-song-hong",
  "https://hanoimoi.vn/phap-luat",
  "https://hanoimoi.vn/phap-luat/an-ninh-trat-tu",
  "https://hanoimoi.vn/phap-luat/phap-dinh",
  "https://hanoimoi.vn/phap-luat/tu-van",
  "https://hanoimoi.vn/ban-doc",
  "https://hanoimoi.vn/ban-doc/duong-day-nong",
  "https://hanoimoi.vn/ban-doc/y-kien-phan-hoi",
  "https://hanoimoi.vn/goc-nhin",
  "https://hanoimoi.vn/moi-ngay-mot-chuyen",
  "https://hanoimoi.vn/podcast",
  "https://hanoimoi.vn/podcast/tin-tuc",
  "https://hanoimoi.vn/podcast/bon-mua-cam-xuc",
  "https://hanoimoi.vn/san-pham-dich-vu",
  "https://hanoimoi.vn/thong-bao",
  "https://hanoimoi.vn/doanh-nghiep",
  "https://hanoimoi.vn/doanh-nghiep/doanh-nhan",
  "https://hanoimoi.vn/doanh-nghiep/khoi-nghiep",
];

let proxyCursor = 0;

function normalizeCategoryUrl(url) {
  return String(url).trim().replace(/\/+$/, "");
}

function normalizeArticleUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function isLikelyArticleUrl(url) {
  if (!url || !/^https?:\/\//.test(url)) return false;
  try {
    const u = new URL(url);
    if (!u.hostname.replace(/^www\./, "").endsWith("hanoimoi.vn")) return false;
  } catch {
    return false;
  }
  const pathname = new URL(url).pathname;
  if (/\/trang-\d+$/.test(pathname)) return false;
  if (/\/$/.test(pathname) && pathname.length <= 2) return false;
  return /\.(html?|htm)$/.test(pathname) || /\-\d+\.(html?|htm)$/.test(pathname) || /\/[^/]+\-\d+\.(html?|htm)$/.test(pathname);
}

function getNextProxy() {
  if (!listProxy.length) return null;
  const proxy = listProxy[proxyCursor % listProxy.length];
  proxyCursor += 1;
  return proxy;
}

function maskProxy(proxyUrl) {
  try {
    const u = new URL(proxyUrl);
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return proxyUrl;
  }
}

function buildAxiosConfig(url, proxyUrl) {
  const config = {
    url,
    method: "GET",
    timeout: 30000,
    responseType: "text",
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "vi,en-US;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  };

  if (proxyUrl) {
    const agent = new HttpsProxyAgent(proxyUrl);
    config.httpAgent = agent;
    config.httpsAgent = agent;
    config.proxy = false;
  }

  return config;
}

async function fetchHtml(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES_PER_REQUEST; attempt++) {
    const proxyUrl = getNextProxy();

    try {
      const res = await axios(buildAxiosConfig(url, proxyUrl));

      const status = res.status;
      const html = String(res.data || "");
      const finalUrl = res.request?.res?.responseUrl || url;

      if (status >= 200 && status < 400) {
        return {
          status,
          html,
          finalUrl,
          proxyUsed: proxyUrl,
          ok: true,
        };
      }

      lastError = new Error(`HTTP ${status}`);
      console.log(
        `[retry ${attempt}/${MAX_RETRIES_PER_REQUEST}] ${url} -> ${status} via ${maskProxy(proxyUrl)}`
      );
    } catch (error) {
      lastError = error;
      console.log(
        `[retry ${attempt}/${MAX_RETRIES_PER_REQUEST}] ${url} -> ${error.message} via ${maskProxy(proxyUrl)}`
      );
    }
  }

  return {
    status: 0,
    html: "",
    finalUrl: url,
    proxyUsed: null,
    ok: false,
    error: lastError?.message || "Unknown error",
  };
}

/**
 * Lấy giá trị data-action từ thẻ div có data-view="mostRead".
 * Tìm trong div đó phần tử có attribute data-action (vd: api/getarticletopread/463).
 */
function extractMostReadDataAction(html) {
  const $ = cheerio.load(html);
  const $mostRead = $('div[data-view="mostRead"]');
  if (!$mostRead.length) return null;
  const $withAction = $mostRead.find('[data-action]').first();
  if (!$withAction.length) {
    const attr = $mostRead.attr("data-action");
    return attr || null;
  }
  return $withAction.attr("data-action") || null;
}

function extractArticleLinksFromHtml(html, baseUrl = BASE_URL) {
  const $ = cheerio.load(html);
  const links = new Set();

  $("a[href]").each((_, el) => {
    let href = $(el).attr("href");
    if (!href) return;

    href = href.trim();

    if (href.startsWith("//")) href = `https:${href}`;
    if (href.startsWith("/")) href = `${baseUrl.replace(/\/+$/, "")}${href}`;

    const normalized = normalizeArticleUrl(href);
    if (!normalized) return;

    if (isLikelyArticleUrl(normalized)) {
      links.add(normalized);
    }
  });

  return [...links];
}

async function mapLimit(items, limit, iteratorFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) break;

      try {
        results[currentIndex] = await iteratorFn(items[currentIndex], currentIndex);
      } catch (error) {
        results[currentIndex] = { error: error.message };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );

  await Promise.all(workers);
  return results;
}

async function saveJson(filePath, data) {
  const fullPath = path.resolve(filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Saved: ${fullPath}`);
}

async function crawlCategory(categoryUrl) {
  const url = normalizeCategoryUrl(categoryUrl);
  const { status, html, finalUrl, proxyUsed, ok, error } = await fetchHtml(url);

  const dataAction = ok ? extractMostReadDataAction(html) : null;
  const articleLinks = ok ? extractArticleLinksFromHtml(html) : [];

  return {
    categoryUrl: url,
    finalUrl,
    status,
    proxyUsed: proxyUsed ? maskProxy(proxyUsed) : null,
    ok,
    error: error || null,
    dataAction,
    articleCount: articleLinks.length,
    articleLinks,
  };
}

async function main() {
  const categoryUrls = [...new Set(CATEGORY_URLS.map(normalizeCategoryUrl))];

  console.log(`Total categories: ${categoryUrls.length}`);
  console.log(`Total proxies: ${listProxy.length}`);

  const results = await mapLimit(
    categoryUrls,
    CONCURRENCY,
    async (categoryUrl, index) => {
      const result = await crawlCategory(categoryUrl);
      console.log(
        `[${index + 1}/${categoryUrls.length}]`,
        `status=${result.status}`,
        `articles=${result.articleCount}`,
        result.dataAction != null ? `dataAction=${result.dataAction}` : "",
        result.categoryUrl
      );
      return result;
    }
  );

  const allArticleLinks = [
    ...new Set(
      results.flatMap((item) =>
        Array.isArray(item.articleLinks) ? item.articleLinks : []
      )
    ),
  ].sort();

  const categoryMostReadList = results.map((item) => ({
    categoryUrl: item.categoryUrl,
    dataAction: item.dataAction ?? null,
  }));
  categoryMostReadList.sort((a, b) => a.categoryUrl.localeCompare(b.categoryUrl));

  await saveJson("./output/hanoimoi-category-mostread.json", {
    totalCategories: categoryMostReadList.length,
    categories: categoryMostReadList,
  });

  await saveJson("./output/hanoimoi-article-links.json", allArticleLinks);

  console.log("\n=== DONE ===");
  console.log("Categories with mostRead dataAction:", categoryMostReadList.length);
  console.log("Unique article links:", allArticleLinks.length);
}

main().catch((error) => {
  console.error("ERROR:", error);
  process.exit(1);
});
