# 학명 등급 문항 54종 (DD 27 + 대조군 27)

질문은 `{학명}의 IUCN 등급은?`, 답변은 종을 `이 종`으로만 가리킨다
(기존 규칙 — 답변에 학명을 넣지 않는다).

두 집단 모두 `phy-` (PHYLACINE) 포유류이고 **목(order) 분포가 동일**하다.
차이는 등급 유무뿐이라, 모델이 '학명 질문이면 모른다'가 아니라
'데이터에 등급이 있으면 답하고 없으면 없다고 한다'를 배우도록 짠 통제군이다.

## DD 27종 — 답변 결측

IUCN 이 실제로 Data Deficient 로 판정한 종. `common_name_ko` /
`common_name_en` / `wikipedia_title` 이 모두 비어 있어 한글명 문항은 불가능하다.

| # | 학명 | 목 | 과 | 추세 | split |
|---:|---|---|---|---|---|
| 1 | *Allactaga tetradactyla* | Rodentia | Dipodidae | Unknown | valid |
| 2 | *Crocidura monax* | Eulipotyphla | Soricidae | Unknown | train |
| 3 | *Crocidura nana* | Eulipotyphla | Soricidae | Unknown | train |
| 4 | *Ctenomys fulvus* | Rodentia | Ctenomyidae | Unknown | train |
| 5 | *Eothenomys proditor* | Rodentia | Cricetidae | Unknown | test |
| 6 | *Eptesicus bobrinskoi* | Chiroptera | Vespertilionidae | Unknown | train |
| 7 | *Gerbillus latastei* | Rodentia | Muridae | Unknown | train |
| 8 | *Microdillus peeli* | Rodentia | Muridae | Unknown | train |
| 9 | *Miniopterus africanus* | Chiroptera | Miniopteridae | Unknown | train |
| 10 | *Mormopterus loriae* | Chiroptera | Molossidae | Stable | valid |
| 11 | *Murina aurata* | Chiroptera | Vespertilionidae | Unknown | train |
| 12 | *Murina tubinaris* | Chiroptera | Vespertilionidae | Unknown | train |
| 13 | *Mus callewaerti* | Rodentia | Muridae | Unknown | train |
| 14 | *Myomyscus yemeni* | Rodentia | Muridae | Unknown | test |
| 15 | *Myotis davidii* | Chiroptera | Vespertilionidae | Unknown | train |
| 16 | *Myotis montivagus* | Chiroptera | Vespertilionidae | Unknown | train |
| 17 | *Nesolagus netscheri* | Lagomorpha | Leporidae | Unknown | train |
| 18 | *Oenomys ornatus* | Rodentia | Muridae | Unknown | train |
| 19 | *Oryzomys dimidiatus* | Rodentia | Cricetidae | Unknown | valid |
| 20 | *Pudu mephistophiles* | Cetartiodactyla | Cervidae | Decreasing | train |
| 21 | *Rhinolophus arcuatus* | Chiroptera | Rhinolophidae | Stable | train |
| 22 | *Rhinolophus shortridgei* | Chiroptera | Rhinolophidae | Unknown | train |
| 23 | *Sorex buchariensis* | Eulipotyphla | Soricidae | Unknown | test |
| 24 | *Sorex volnuchini* | Eulipotyphla | Soricidae | Unknown | train |
| 25 | *Sylvilagus insonus* | Lagomorpha | Leporidae | Unknown | train |
| 26 | *Syntheosciurus brochus* | Rodentia | Sciuridae | Decreasing | train |
| 27 | *Thomasomys pyrrhonotus* | Rodentia | Cricetidae | Decreasing | train |

## 대조군 27종 — 답변 있음

| # | 학명 | 등급 | 목 | 과 | split |
|---:|---|---|---|---|---|
| 1 | *Balaena mysticetus* | VU | Cetartiodactyla | Balaenidae | valid |
| 2 | *Rousettus aegyptiacus* | CR | Chiroptera | Pteropodidae | train |
| 3 | *Pteropus giganteus* | EN | Chiroptera | Pteropodidae | train |
| 4 | *Barbastella barbastellus* | VU | Chiroptera | Vespertilionidae | train |
| 5 | *Myotis bechsteinii* | VU | Chiroptera | Vespertilionidae | test |
| 6 | *Myotis blythii* | VU | Chiroptera | Vespertilionidae | train |
| 7 | *Myotis dasycneme* | VU | Chiroptera | Vespertilionidae | train |
| 8 | *Pipistrellus subflavus* | VU | Chiroptera | Vespertilionidae | train |
| 9 | *Pteropus leucopterus* | VU | Chiroptera | Pteropodidae | train |
| 10 | *Rhinolophus blasii* | VU | Chiroptera | Rhinolophidae | valid |
| 11 | *Crocidura rhoditis* | VU | Eulipotyphla | Soricidae | train |
| 12 | *Hemiechinus auritus* | VU | Eulipotyphla | Erinaceidae | train |
| 13 | *Blarinella quadraticauda* | NT | Eulipotyphla | Soricidae | train |
| 14 | *Chimarrogale hantu* | NT | Eulipotyphla | Soricidae | test |
| 15 | *Lepus yarkandensis* | NT | Lagomorpha | Leporidae | train |
| 16 | *Sylvilagus obscurus* | NT | Lagomorpha | Leporidae | train |
| 17 | *Ctenomys peruanus* | CR | Rodentia | Ctenomyidae | train |
| 18 | *Sicista severtzovi* | CR | Rodentia | Dipodidae | train |
| 19 | *Spermophilus pygmaeus* | CR | Rodentia | Sciuridae | valid |
| 20 | *Zyzomys palatalis* | CR | Rodentia | Muridae | train |
| 21 | *Lagurus lagurus* | EN | Rodentia | Cricetidae | train |
| 22 | *Ellobius talpinus* | VU | Rodentia | Cricetidae | train |
| 23 | *Perognathus alticola* | VU | Rodentia | Heteromyidae | test |
| 24 | *Peromyscus polius* | VU | Rodentia | Cricetidae | train |
| 25 | *Rheomys thomasi* | VU | Rodentia | Cricetidae | train |
| 26 | *Abrothrix sanborni* | NT | Rodentia | Cricetidae | train |
| 27 | *Akodon siberiae* | NT | Rodentia | Cricetidae | train |
