# 위협/서식지 문항을 추가한 API 57종

API 종 선정 순서(기존 24종 → 속별 라운드로빈) **앞에서부터 57종**.
각 종에 `주요 위협은?` / `어디에 사나요?` 2문항이 추가되며 답은 전부
`이 종의 데이터에는 없습니다.` — 이 114건이 결측의 대부분이다.
나머지 결측은 수기 시드 절멸종 4종 8건 + DD 종 학명 문항 27건.

※ 원래 67종이었으나 학명 문항 54건(결측률 50%)이 전체 결측률을 24.2% 로
  끌어올려서, 10종을 덜어내 21.98% 로 되돌렸다(보정A).

배분: train 53 / valid 2 / test 2

| # | 한글명 | 학명 | IUCN | 추세 | split |
|---:|---|---|---|---|---|
| 1 | 메콩자이언트연어잉어 | *Aaptosyax grypus* | CR | 감소 | train |
| 2 | 백산주전나무 | *Abies beshanzuensis* | CR | 감소 | train |
| 3 | 히달고 전나무 | *Abies hidalgensis* | VU | 알 수 없음 | valid |
| 4 | 위안바오산 전나무 | *Abies yuanbaoshanensis* | CR | 감소 | test |
| 5 | 지위안 전나무 | *Abies ziyuanensis* | EN | 감소 | train |
| 6 | 아카시아 호위티 | *Acacia howittii* | VU | 감소 | train |
| 7 | 뉴브리튼수리매 | *Accipiter brachyurus* | VU | 감소 | train |
| 8 | 버틀러매 | *Accipiter butleri* | VU | 감소 | train |
| 9 | 군들라치매 | *Accipiter gundlachi* | EN | 감소 | train |
| 10 | 헨시매 | *Accipiter henstii* | VU | 감소 | train |
| 11 | 누란매 | *Accipiter luteoschistaceus* | VU | 감소 | train |
| 12 | 왕매 | *Accipiter princeps* | VU | 감소 | train |
| 13 | 종이껍질단풍나무 | *Acer griseum* | EN | 감소 | train |
| 14 | 긴몸납자루 | *Acheilognathus elongatus* | CR | 알 수 없음 | train |
| 15 | 긴지느러미쑤기 | *Acheilognathus longipinnis* | EN | 감소 | train |
| 16 | 뮤티카천일홍 | *Achyranthes mutica* | EN | 감소 | test |
| 17 | 스털렛 | *Acipenser ruthenus* | EN | 감소 | train |
| 18 | 유럽철갑상어 | *Acipenser sturio* | CR | 감소 | valid |
| 19 | 엘크뿔산호 | *Acropora palmata* | CR | 감소 | train |
| 20 | 아크티넬라 오브세라타 | *Actinella obserata* | CR | 알 수 없음 | train |
| 21 | 수아레즈바오밥 | *Adansonia suarezensis* | EN | 감소 | train |
| 22 | 일본산개구리 | *Hyla heinzsteinitzi* | LC | 안정 | train |
| 23 | 넓은부채산호 | *Eunicella verrucosa* | NT | 감소 | train |
| 24 | 날개씨자나무 | *Pterospermum reticulatum* | LC | 안정 | train |
| 25 | 아시아치타 | *Acinonyx jubatus venaticus* | VU | 감소 | train |
| 26 | 페리에 바오밥 | *Adansonia perrieri* | CR | 감소 | train |
| 27 | 아닥스 | *Addax nasomaculatus* | CR | 감소 | train |
| 28 | 스리랑카두꺼비 | *Adenomus dasi* | EN | 감소 | train |
| 29 | 뉴칼레도니아올빼미야행조 | *Aegotheles savesi* | CR | 알 수 없음 | train |
| 30 | 미드웨이박각시나방 | *Agrotis fasciata* | CR | 알 수 없음 | train |
| 31 | 탈라우드곰쿠스쿠스 | *Ailurops melanotis* | CR | 감소 | train |
| 32 | 애팔래치안 엘크발조개 | *Alasmidonta raveneliana* | CR | 감소 | train |
| 33 | 프레스파송어 | *Alburnoides prespensis* | EN | 알 수 없음 | train |
| 34 | 이탈리안 블리크 | *Alburnus albidus* | EN | 감소 | train |
| 35 | 양쯔강악어 | *Alligator sinensis* | CR | 안정 | train |
| 36 | 알로에 아디그라타나 | *Aloe adigratana* | EN | 알 수 없음 | train |
| 37 | 알리스 셰드 | *Alosa alosa* | CR | 감소 | train |
| 38 | 발디비아 개구리 | *Alsodes valdiviensis* | EN | 감소 | train |
| 39 | 알스토니아 페낭기아나 | *Alstonia penangiana* | CR | 알 수 없음 | train |
| 40 | 베틱산파족개구리 | *Alytes dickhilleni* | EN | 감소 | train |
| 41 | 아마니포다그리온 길리에시 | *Amanipodagrion gilliesi* | CR | 감소 | train |
| 42 | 칸나시클리드 | *Amatitlania kanna* | EN | 감소 | train |
| 43 | 분홍가슴앵무 | *Amazona vinacea* | EN | 감소 | train |
| 44 | 대만물푸레나무 | *Amentotaxus formosana* | EN | 감소 | train |
| 45 | 아스토르키시클리드 | *Amphilophus astorquii* | CR | 감소 | train |
| 46 | 아나바릴리우스 폴릴레피스 | *Anabarilius polylepis* | EN | 감소 | train |
| 47 | 베르니에 쏜오리 | *Anas bernieri* | EN | 감소 | train |
| 48 | 요세미티두꺼비 | *Anaxyrus canorus* | VU | 감소 | train |
| 49 | 아샹기호 국자따개 | *Ancylus ashangiensis* | CR | 알 수 없음 | train |
| 50 | 날개발앙고스투라 | *Angostura alipes* | CR | 감소 | train |
| 51 | 좁은톱날가오리 | *Anoxypristis cuspidata* | CR | 감소 | train |
| 52 | 그리스국화 | *Anthemis glaberrima* | EN | 감소 | train |
| 53 | 니세이안토세로스 | *Anthoceros neesii* | EN | 알 수 없음 | train |
| 54 | 섭정꿀빨새 | *Anthochaera phrygia* | CR | 감소 | train |
| 55 | 아라리페솔다디뉴 | *Antilophia bokermanni* | CR | 감소 | train |
| 56 | 마사푸에라 까투리새 | *Aphrastura masafuerae* | CR | 안정 | train |
| 57 | 이니리다이드시클리드 | *Apistogramma iniridae* | VU | 알 수 없음 | train |
