"""Adatbazis seed: 60 film + embedding + 30 EPG musor + AI enrichment.

Futtatas a szerveren:
  docker compose exec fastapi python /app/scripts/seed_data.py
"""

import asyncio
import os
import sys
import time

sys.path.insert(0, "/app")

import httpx
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, text
from app.database import async_session_factory
from app.models.models import MovieModel, EpgProgramModel

OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com")

EPG_ENRICH_URL = "http://localhost:8000/api/v1/enrich"

SAMPLE_MOVIES = [
    {"title": "Forrest Gump", "year": "1994", "plot": "Egy egyszeru ember rendkivuli elete es kalandjai az amerikai tortenelem viharos evtizedeiben.", "genre": "Drama, Vigjatek", "director": "Robert Zemeckis", "rating": "8.8", "tmdb_id": 13},
    {"title": "A tanu", "year": "1969", "plot": "Pelikan Jozsef, egy gatlazos es bator ember tortenete a kommunista Magyarorszagon.", "genre": "Drama, Magyar", "director": "Bacso Peter", "rating": "8.5", "tmdb_id": 0},
    {"title": "Kontroll", "year": "2003", "plot": "A budapesti metroellenorok zart vilagaban jatszodo sotet komedia es thriller.", "genre": "Thriller, Vigjatek, Magyar", "director": "Antal Nimrod", "rating": "8.2", "tmdb_id": 0},
    {"title": "A Legenyanya", "year": "1989", "plot": "Egy ferfi veletlenul teherbe esik es ateli a varandossag minden oromet es nehezseget.", "genre": "Vigjatek, Magyar", "director": "Timar Peter", "rating": "7.2", "tmdb_id": 0},
    {"title": "Macskafogo", "year": "1986", "plot": "Az egerpopulacio utolsó mentsvara: egy belga mesterdetektiv a macskak elleni harcban.", "genre": "Animacio, Vigjatek, Magyar", "director": "Ternovszky Bela", "rating": "8.6", "tmdb_id": 0},
    {"title": "Hyppolit a lakaj", "year": "1931", "plot": "Egy ujgazdag csalad felfogad egy eloskodo komornyikot, aki fenekestul forgatja fel az eletuket.", "genre": "Vigjatek, Magyar", "director": "Szekely Istvan", "rating": "8.3", "tmdb_id": 0},
    {"title": "Szaffi", "year": "1985", "plot": "Egy fiatal nemes es egy ciganylany szerelmi tortenete a torok korban, repulo szonyeggel.", "genre": "Animacio, Kaland, Magyar", "director": "Dargay Attila", "rating": "8.0", "tmdb_id": 0},
    {"title": "Mephisto", "year": "1981", "plot": "Egy nemet szinesz moralis dilemmaja a naci Nemetorszagban, az egyetlen magyar Oscar-dijas film.", "genre": "Drama, Tortenelmi, Magyar", "director": "Szabo Istvan", "rating": "7.8", "tmdb_id": 0},
    {"title": "Az otodik pecset", "year": "1976", "plot": "Egy kocsmaban negy ferfi elmori dilemmaja: melyik lenne a legszebb halal?", "genre": "Drama, Magyar", "director": "Fabri Zoltan", "rating": "8.1", "tmdb_id": 0},
    {"title": "Indul a bakterhaz", "year": "1980", "plot": "Egy falusi kisfiu viszontagsagai, aki bakternak all, hogy penzt keressen a csaladjanak.", "genre": "Vigjatek, Csaladi, Magyar", "director": "Mihalyfy Sandor", "rating": "7.9", "tmdb_id": 0},
    {"title": "The Shawshank Redemption", "year": "1994", "plot": "Egy artatlanul elitelt bankar ket evtizedes szabadulasi terve a Shawshank bortonben.", "genre": "Drama", "director": "Frank Darabont", "rating": "9.3", "tmdb_id": 278},
    {"title": "The Godfather", "year": "1972", "plot": "A Corleone maffiacsalad felemenkedese es belso harcai New Yorkban.", "genre": "Drama, Krimi", "director": "Francis Ford Coppola", "rating": "9.2", "tmdb_id": 238},
    {"title": "The Dark Knight", "year": "2008", "plot": "Batman szembeszall a kaotikus Jokerrel, aki Gotham varosat terrorizalja.", "genre": "Akcio, Drama, Krimi", "director": "Christopher Nolan", "rating": "9.0", "tmdb_id": 155},
    {"title": "Pulp Fiction", "year": "1994", "plot": "Osszefonodo tortenetek Los Angeles alvilagabol: boxolo, berencsek, drogdilerek.", "genre": "Krimi, Drama", "director": "Quentin Tarantino", "rating": "8.9", "tmdb_id": 680},
    {"title": "Schindler's List", "year": "1993", "plot": "Egy nemet iparmagnas tobb mint ezer zsido eletet menti meg a holokauszt alatt.", "genre": "Drama, Tortenelmi, Haborus", "director": "Steven Spielberg", "rating": "9.0", "tmdb_id": 424},
    {"title": "The Matrix", "year": "1999", "plot": "Egy hacker felfedezi, hogy a valosag csak egy szimulacio, es csatlakozik az ellenallashoz.", "genre": "Akcio, Sci-Fi", "director": "Wachowski testverek", "rating": "8.7", "tmdb_id": 603},
    {"title": "Goodfellas", "year": "1990", "plot": "Egy fiatal ferfi felemenkedese a New York-i maffia rangletrajan.", "genre": "Drama, Krimi, Eletrajzi", "director": "Martin Scorsese", "rating": "8.7", "tmdb_id": 769},
    {"title": "Fight Club", "year": "1999", "plot": "Egy almomentes irodai dolgozo es egy karizmatikus szappanarus titkos verekedo klubot alapit.", "genre": "Drama, Thriller", "director": "David Fincher", "rating": "8.8", "tmdb_id": 550},
    {"title": "Inception", "year": "2010", "plot": "Egy profi tolkvaj beszivarog az almodok tudatalattijaba, hogy elultessen egy otletet.", "genre": "Akcio, Sci-Fi, Thriller", "director": "Christopher Nolan", "rating": "8.8", "tmdb_id": 27205},
    {"title": "Interstellar", "year": "2014", "plot": "Foldi urhajosok egy fekete lyukon keresztul utaznak, hogy uj lakhato bolygot talaljanak.", "genre": "Sci-Fi, Drama, Kaland", "director": "Christopher Nolan", "rating": "8.7", "tmdb_id": 157336},
    {"title": "Parasite", "year": "2019", "plot": "Egy szegeny csalad ravasz modon beszivárog egy gazdag csalad eletebe.", "genre": "Drama, Thriller", "director": "Bong Joon-ho", "rating": "8.5", "tmdb_id": 496243},
    {"title": "Gladiator", "year": "2000", "plot": "Egy romai tbornok bosszut all csaszaran, aki megolte a csaladjat es rabszolgasorba taszitotta.", "genre": "Akcio, Drama, Kaland", "director": "Ridley Scott", "rating": "8.5", "tmdb_id": 98},
    {"title": "The Silence of the Lambs", "year": "1991", "plot": "Egy fiatal FBI-ugynok egy kannibal pszichopata segitsegevel probal elkapni egy sorozatgyilkost.", "genre": "Thriller, Krimi, Drama", "director": "Jonathan Demme", "rating": "8.6", "tmdb_id": 274},
    {"title": "Saving Private Ryan", "year": "1998", "plot": "Egy amerikai szakasz a masodik vilaghaboruban megkeres egy katonat, akinek mindharom testvere elesett.", "genre": "Haborus, Drama", "director": "Steven Spielberg", "rating": "8.6", "tmdb_id": 857},
    {"title": "The Green Mile", "year": "1999", "plot": "Egy bortonor eletvalto kapcsolata egy halalraitelttel, aki termeszetfeletti kepessegekkel rendelkezik.", "genre": "Drama, Fantasy, Krimi", "director": "Frank Darabont", "rating": "8.6", "tmdb_id": 497},
    {"title": "The Departed", "year": "2006", "plot": "Egy beepitett rendor es egy beepitett bunozo kozotti macska-eger jatek Bostonban.", "genre": "Krimi, Drama, Thriller", "director": "Martin Scorsese", "rating": "8.5", "tmdb_id": 1422},
    {"title": "Whiplash", "year": "2014", "plot": "Egy ambiciozus fiatal dobos es egy kegyetlen zenei professzor feszultseggel teli kapcsolata.", "genre": "Drama, Zene", "director": "Damien Chazelle", "rating": "8.5", "tmdb_id": 244786},
    {"title": "Django Unchained", "year": "2012", "plot": "Egy felszabaditott rabszolga es egy nemet fejvadasz bosszuhadjarata a Deli allamokban.", "genre": "Western, Drama", "director": "Quentin Tarantino", "rating": "8.4", "tmdb_id": 68718},
    {"title": "The Prestige", "year": "2006", "plot": "Ket rivalis budapesti szarmazasu varazslo halalos versengese a tokeletes trukkert.", "genre": "Drama, Thriller, Mystery", "director": "Christopher Nolan", "rating": "8.5", "tmdb_id": 1124},
    {"title": "Leon: The Professional", "year": "1994", "plot": "Egy profi berences es egy 12 eves lany szokatlan baratsaga, bosszuval a vegen.", "genre": "Akcio, Drama, Thriller", "director": "Luc Besson", "rating": "8.5", "tmdb_id": 197},
    {"title": "The Usual Suspects", "year": "1995", "plot": "Egy rendor kihallgat egy tulelot, aki egy rejtelyes bunozorol mesel. A veg varatlan.", "genre": "Krimi, Thriller, Mystery", "director": "Bryan Singer", "rating": "8.5", "tmdb_id": 629},
    {"title": "Oldboy", "year": "2003", "plot": "Egy ferfi 15 ev fogsag utan szabadul, es bosszut all azokon, akik bezartak.", "genre": "Thriller, Drama, Mystery", "director": "Park Chan-wook", "rating": "8.4", "tmdb_id": 670},
    {"title": "Se7en", "year": "1995", "plot": "Ket nyomozo egy sorozatgyilkost uldoz, aki a het fobun alapulo gyilkossagokat kovet el.", "genre": "Krimi, Thriller, Drama", "director": "David Fincher", "rating": "8.6", "tmdb_id": 807},
    {"title": "City of God", "year": "2002", "plot": "Fenykepezo lesz egy fiubol Rio de Janeiro legveszelyesebb nyomornegyedeben.", "genre": "Drama, Krimi", "director": "Fernando Meirelles", "rating": "8.6", "tmdb_id": 598},
    {"title": "Spirited Away", "year": "2001", "plot": "Egy kislany egy varazslatos furdohazban ragad, tele szellemekkel es istensegekkel.", "genre": "Animacio, Fantasy, Kaland", "director": "Hayao Miyazaki", "rating": "8.6", "tmdb_id": 129},
    {"title": "Life Is Beautiful", "year": "1997", "plot": "Egy apa jateknak alazza a koncentracios tabor szornyusegeit, hogy megvedje a kisfiat.", "genre": "Drama, Vigjatek, Haborus", "director": "Roberto Benigni", "rating": "8.6", "tmdb_id": 637},
    {"title": "Back to the Future", "year": "1985", "plot": "Egy tinédzser veletlenul 1955-be utazik egy idogep DeLorean-nel, es meg kell javitania a multat.", "genre": "Sci-Fi, Vigjatek, Kaland", "director": "Robert Zemeckis", "rating": "8.5", "tmdb_id": 105},
    {"title": "Alien", "year": "1979", "plot": "Egy urhajo legenysege egy halalos idegen lennyel talalkozik a melyurben.", "genre": "Sci-Fi, Horror", "director": "Ridley Scott", "rating": "8.5", "tmdb_id": 348},
    {"title": "Terminator 2", "year": "1991", "plot": "Egy kiborgot kuld vissza az idoben, hogy megvedje a jovo vezetot egy fejlettebb gyilkos gep ellen.", "genre": "Akcio, Sci-Fi", "director": "James Cameron", "rating": "8.6", "tmdb_id": 280},
    {"title": "American History X", "year": "1998", "plot": "Egy volt neonáci probalja megakadalyozni, hogy az occse ugyan azt az utat jarja be.", "genre": "Drama, Krimi", "director": "Tony Kaye", "rating": "8.5", "tmdb_id": 73},
    {"title": "Cinema Paradiso", "year": "1988", "plot": "Egy sikerfilmrendezo visszaemlekszik a gyerekkorara es a falu mozisara Sziciliaban.", "genre": "Drama", "director": "Giuseppe Tornatore", "rating": "8.5", "tmdb_id": 11216},
    {"title": "Requiem for a Dream", "year": "2000", "plot": "Negy ember elete szetesik a drogok, az amok es a fuggosegek spiraljaban.", "genre": "Drama, Thriller", "director": "Darren Aronofsky", "rating": "8.3", "tmdb_id": 641},
    {"title": "The Lion King", "year": "1994", "plot": "Egy fiatal oroszlan herceg szembenez a sorsaval es visszaszerzi a kiralysagat.", "genre": "Animacio, Drama, Kaland", "director": "Roger Allers", "rating": "8.5", "tmdb_id": 8587},
    {"title": "The Truman Show", "year": "1998", "plot": "Egy ferfi fokozatosan rajon, hogy az egesz elete egy valosagshow, amit a vilag nez.", "genre": "Drama, Sci-Fi, Vigjatek", "director": "Peter Weir", "rating": "8.2", "tmdb_id": 37165},
    {"title": "The Pianist", "year": "2002", "plot": "Egy lengyel zongoramvesz tulelese a varsói gettoban a masodik vilaghaboru alatt.", "genre": "Drama, Haborus, Zene", "director": "Roman Polanski", "rating": "8.5", "tmdb_id": 423},
    {"title": "Joker", "year": "2019", "plot": "Egy mentalis betegseggel kuzdo stand-up komikus eroszakaos utat jar be Gotham varosaban.", "genre": "Drama, Thriller, Krimi", "director": "Todd Phillips", "rating": "8.4", "tmdb_id": 475557},
    {"title": "Eternal Sunshine", "year": "2004", "plot": "Egy par kitorli egymast az emlekezetebol, de a szerelem ismet utat tor maganak.", "genre": "Drama, Sci-Fi, Romantikus", "director": "Michel Gondry", "rating": "8.3", "tmdb_id": 38},
    {"title": "Amelie", "year": "2001", "plot": "Egy fiatal parizsi no csendben javitja masok eletet, mikozben a sajat boldogsagat keresi.", "genre": "Vigjatek, Romantikus", "director": "Jean-Pierre Jeunet", "rating": "8.3", "tmdb_id": 194},
    {"title": "Das Boot", "year": "1981", "plot": "Egy nemet tengeralattjaro legenysegenek pokoli elete a masodik vilaghaboruban.", "genre": "Haborus, Drama, Thriller", "director": "Wolfgang Petersen", "rating": "8.4", "tmdb_id": 346},
    {"title": "No Country for Old Men", "year": "2007", "plot": "Egy vadasz belebotlik egy drogbizniszbe es egy kegyetlen berences uzi a penzt.", "genre": "Thriller, Krimi, Drama", "director": "Coen testverek", "rating": "8.2", "tmdb_id": 6977},
    {"title": "Blade Runner 2049", "year": "2017", "plot": "Egy replikans vadasz felfedez egy sulyos titkot, ami megvaltoztathatja a tarsadalmat.", "genre": "Sci-Fi, Drama, Mystery", "director": "Denis Villeneuve", "rating": "8.0", "tmdb_id": 335984},
    {"title": "Mad Max: Fury Road", "year": "2015", "plot": "Egy poszt-apokaliptikus pusztasagban egy lakatos es egy lazado no menekul a hadurak elol.", "genre": "Akcio, Sci-Fi, Kaland", "director": "George Miller", "rating": "8.1", "tmdb_id": 76341},
    {"title": "Shutter Island", "year": "2010", "plot": "Ket US marsall nyomoz egy elmegyogyintezetben eltunt beteg utan, de semmi sem az aminek latszik.", "genre": "Thriller, Mystery, Drama", "director": "Martin Scorsese", "rating": "8.2", "tmdb_id": 11324},
    {"title": "The Grand Budapest Hotel", "year": "2014", "plot": "Egy szalloigazgato es egy londiner kalandjai a ket vilaghaboru kozott.", "genre": "Vigjatek, Kaland, Drama", "director": "Wes Anderson", "rating": "8.1", "tmdb_id": 120467},
    {"title": "A Clockwork Orange", "year": "1971", "plot": "Egy eroszakos fiatalembert a kormany pszichologiai atnevelesnek vet ala.", "genre": "Drama, Sci-Fi, Krimi", "director": "Stanley Kubrick", "rating": "8.3", "tmdb_id": 185},
    {"title": "Taxi Driver", "year": "1976", "plot": "Egy maganyos vietnami veterán taxisofor kiall a korrupcio es a bun ellen New Yorkban.", "genre": "Drama, Krimi, Thriller", "director": "Martin Scorsese", "rating": "8.2", "tmdb_id": 103},
    {"title": "Full Metal Jacket", "year": "1987", "plot": "Amerikai tengereszgyalogosok kepzese es vietnami haborus bevetese a kubricki szemmel.", "genre": "Haborus, Drama", "director": "Stanley Kubrick", "rating": "8.3", "tmdb_id": 600},
    {"title": "Apocalypse Now", "year": "1979", "plot": "Egy amerikai szazados a vietnami dzsungelben utazik, hogy vegrehajtson egy lehetetlen kuldest.", "genre": "Haborus, Drama", "director": "Francis Ford Coppola", "rating": "8.5", "tmdb_id": 28},
    {"title": "The Thing", "year": "1982", "plot": "Egy antarktiszi kutatoallomas legenysege egy alakevalto idegen letformaval kuzd.", "genre": "Sci-Fi, Horror", "director": "John Carpenter", "rating": "8.2", "tmdb_id": 1091},
]
SAMPLE_EPG = [
    {"channel_id": "rtl_klub_hd", "channel_name": "RTL Klub HD", "title": "A Király", "start": "+1h", "end": "+2h", "description": "Magyar életrajzi dráma Puskás Ferenc életéről."},
    {"channel_id": "tv2_hd", "channel_name": "TV2 HD", "title": "Házasodik a tücsök", "start": "+30m", "end": "+1h30m", "description": "Vígjáték egy agglegény tücsökről aki végre megházasodna."},
    {"channel_id": "duna_tv", "channel_name": "Duna TV", "title": "Esti Kornél", "start": "+2h", "end": "+2h30m", "description": "Kosztolányi Dezső novelláiból készült irodalmi adaptáció."},
    {"channel_id": "m4_sport", "channel_name": "M4 Sport", "title": "Magyarország-Anglia", "start": "+3h", "end": "+5h", "description": "Labdarúgó világbajnoki selejtező élőben a Puskás Arénából."},
    {"channel_id": "rtl_klub_hd", "channel_name": "RTL Klub HD", "title": "Drága örökösök", "start": "+2h", "end": "+3h", "description": "A Tibi és a család újabb bonyodalmakba keveredik."},
    {"channel_id": "tv2_hd", "channel_name": "TV2 HD", "title": "Jóban Rosszban", "start": "+1h30m", "end": "+2h15m", "description": "A Csillagkút klinika dolgozói életébe nyerhetünk bepillantást."},
    {"channel_id": "hbo_hd", "channel_name": "HBO HD", "title": "Trónok harca", "start": "+4h", "end": "+5h", "description": "Westeros királyságainak ádáz küzdelme a Vastrónért."},
    {"channel_id": "national_geo", "channel_name": "National Geographic", "title": "A kék bolygó", "start": "+1h", "end": "+2h", "description": "Lenyűgöző természetfilm az óceánok élővilágáról."},
    {"channel_id": "discovery_hd", "channel_name": "Discovery HD", "title": "Aranyláz Alaszkában", "start": "+5h", "end": "+6h", "description": "Aranyásók küzdenek az alaszkai vadonban a meggazdagodásért."},
    {"channel_id": "duna_tv", "channel_name": "Duna TV", "title": "Szerencsés Dániel", "start": "+6h", "end": "+7h", "description": "Egy fiatalember élete a rendszerváltás körüli Magyarországon."},
    {"channel_id": "rtl_klub_hd", "channel_name": "RTL Klub HD", "title": "Barátok közt", "start": "+5h", "end": "+5h30m", "description": "A Mátyás király téri lakók napi drámái és örömei."},
    {"channel_id": "spektrum", "channel_name": "Spektrum HD", "title": "A II. világháború színesben", "start": "+2h", "end": "+3h", "description": "Színezett archív felvételek a második világháború kulcspillanatairól."},
    {"channel_id": "m4_sport", "channel_name": "M4 Sport", "title": "Forma-1 Magyar Nagydíj", "start": "+8h", "end": "+10h", "description": "Élő közvetítés a Hungaroringről."},
    {"channel_id": "hbo_hd", "channel_name": "HBO HD", "title": "Dűne", "start": "+10h", "end": "+12h30m", "description": "Paul Atreides kalandja a sivatagbolygón a fűszerért és az igazságért."},
    {"channel_id": "film_plusz", "channel_name": "Film+ HD", "title": "Halálos iramban 7", "start": "+2h30m", "end": "+4h30m", "description": "Dominic Toretto és csapata még egy utolsó küldetésre indul."},
    {"channel_id": "rtl_klub_hd", "channel_name": "RTL Klub HD", "title": "X-Faktor", "start": "+9h", "end": "+11h", "description": "Élő show! A versenyzők a közönség szavazataiért küzdenek."},
    {"channel_id": "duna_tv", "channel_name": "Duna TV", "title": "Magyar népmesék", "start": "+30m", "end": "+45m", "description": "Klasszikus magyar animációs sorozat a magyar folklór leggazdagabb történeteiből."},
    {"channel_id": "tv2_hd", "channel_name": "TV2 HD", "title": "A Nagy Duett", "start": "+7h", "end": "+9h", "description": "Hírességek és profi énekesek párosa versenyez a közönség kegyeiért."},
    {"channel_id": "national_geo", "channel_name": "National Geographic", "title": "Mars - Az utazás", "start": "+3h", "end": "+4h", "description": "Dokumentumfilm a Mars-utazás tudományos hátteréről és kihívásairól."},
    {"channel_id": "discovery_hd", "channel_name": "Discovery HD", "title": "Vadászat a mélyben", "start": "+1h", "end": "+1h30m", "description": "Cápák és ráják vadászati stratégiái a világ óceánjaiban."},
    {"channel_id": "hbo_hd", "channel_name": "HBO HD", "title": "Chernobyl", "start": "+12h", "end": "+13h", "description": "Az 1986-os csernobili atomkatasztrófa megrázó története."},
    {"channel_id": "film_plusz", "channel_name": "Film+ HD", "title": "John Wick", "start": "+5h", "end": "+7h", "description": "Egy visszavonult bérgyilkos bosszúhadjárata a kutyájáért."},
    {"channel_id": "m4_sport", "channel_name": "M4 Sport", "title": "Vízilabda EB döntő", "start": "+11h", "end": "+13h", "description": "Magyarország a görögök ellen az Európa-bajnoki döntőben."},
    {"channel_id": "spektrum", "channel_name": "Spektrum HD", "title": "Ismeretlen piramisok", "start": "+4h", "end": "+5h", "description": "Egyiptom rejtett piramisainak feltárása modern technológiával."},
    {"channel_id": "rtl_klub_hd", "channel_name": "RTL Klub HD", "title": "Reggeli", "start": "+12h", "end": "+14h", "description": "Élő reggeli magazinműsor hírekkel, interjúkkal, főzéssel."},
    {"channel_id": "tv2_hd", "channel_name": "TV2 HD", "title": "Tények", "start": "+10h", "end": "+10h30m", "description": "A nap legfontosabb hírei és eseményei."},
    {"channel_id": "duna_tv", "channel_name": "Duna TV", "title": "Mesteremberek", "start": "+8h", "end": "+9h", "description": "Hagyományőrző kézműves mesterek bemutatása a Kárpát-medencéből."},
    {"channel_id": "hbo_hd", "channel_name": "HBO HD", "title": "Westworld", "start": "+7h", "end": "+8h", "description": "Egy futurisztikus vidámparkban a mesterséges intelligenciák lázadása."},
    {"channel_id": "film_plusz", "channel_name": "Film+ HD", "title": "Mission: Impossible", "start": "+8h", "end": "+10h30m", "description": "Ethan Hunt lehetetlen küldetése, hogy megakadályozzon egy globális katasztrófát."},
    {"channel_id": "national_geo", "channel_name": "National Geographic", "title": "Géniusz: Einstein", "start": "+6h", "end": "+7h", "description": "Albert Einstein életét és munkásságát bemutató dokumentum-dráma sorozat."},
]

async def embed_text(text: str) -> list[float]:
    """OpenAI embedding generalas egy szovegre."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{OPENAI_URL}/v1/embeddings",
            headers={"Authorization": f"Bearer {OPENAI_KEY}", "Content-Type": "application/json"},
            json={"model": "text-embedding-3-small", "input": text},
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]

def parse_offset(offset_str: str, base: datetime) -> datetime:
    """+1h, +30m, +2h30m formatum parzolasa."""
    offset_str = offset_str.lstrip("+")
    total_minutes = 0
    for part in offset_str.split("h"):
        part = part.strip()
        if part.isdigit():
            total_minutes += int(part) * 60
    for part in offset_str.split("m"):
        part = part.split("h")[-1].strip()
        if part.isdigit():
            total_minutes += int(part)
    return base + timedelta(minutes=total_minutes)

async def main():
    print("=" * 60)
    print(" PusztaPlayer Seed Script")
    print("=" * 60)
    print()

    if not OPENAI_KEY:
        print("HIBA: OPENAI_API_KEY nincs beallitva!")
        return

    async with async_session_factory() as session:
        movie_count = 0
        embed_count = 0

        print(f"[1/3] Filmek es embeddingek ({len(SAMPLE_MOVIES)} db)...")
        for i, m in enumerate(SAMPLE_MOVIES):
            try:
                exists = await session.execute(
                    select(MovieModel).where(MovieModel.title == m["title"]).where(MovieModel.year == m["year"])
                )
                if exists.scalar_one_or_none():
                    print(f"  [{i+1:3d}] SKIP (mar letezik): {m['title']}")
                    continue

                emb = await embed_text(f"Title: {m['title']}. Year: {m['year']}. Plot: {m['plot']}. Genres: {m['genre']}.")
                await asyncio.sleep(0.05)  # rate limit minimal

                movie = MovieModel(
                    title=m["title"], year=m["year"], plot=m["plot"],
                    genre=m["genre"], director=m["director"], rating=m["rating"],
                    tmdb_id=m["tmdb_id"], embedding=emb, meta={}
                )
                session.add(movie)
                await session.commit()
                movie_count += 1
                embed_count += 1
                print(f"  [{i+1:3d}] OK  embedding={len(emb)}d: {m['title']} ({m['year']})")

            except Exception as e:
                await session.rollback()
                print(f"  [{i+1:3d}] ERR: {m['title']} - {str(e)[:100]}")

        print(f"  Filmek: {movie_count} uj, {embed_count} embedding generalva")
        print()

        epg_count = 0
        now = datetime.now(timezone.utc)
        print(f"[2/3] EPG musorok ({len(SAMPLE_EPG)} db)...")
        epg_ids = []

        for i, e in enumerate(SAMPLE_EPG):
            try:
                start_dt = parse_offset(e["start"], now)
                end_dt = parse_offset(e["end"], start_dt)
                epg_id = f"seed_epg_{i+1:04d}"

                exists = await session.execute(select(EpgProgramModel).where(EpgProgramModel.id == epg_id))
                if exists.scalar_one_or_none():
                    print(f"  [{i+1:3d}] SKIP (mar letezik): {e['title']}")
                    continue

                prog = EpgProgramModel(
                    id=epg_id,
                    channel_id=e["channel_id"],
                    channel_name=e["channel_name"],
                    title=e["title"],
                    start=start_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    end=end_dt.strftime("%Y-%m-%d %H:%M:%S"),
                    description=e["description"],
                    start_timestamp=int(start_dt.timestamp()),
                    stop_timestamp=int(end_dt.timestamp()),
                )
                session.add(prog)
                await session.commit()
                epg_ids.append(epg_id)
                epg_count += 1
                print(f"  [{i+1:3d}] OK:  {e['title']} ({e['channel_name']})")

            except Exception as ex:
                await session.rollback()
                print(f"  [{i+1:3d}] ERR: {e['title']} - {str(ex)[:100]}")

        print(f"  EPG musorok: {epg_count} uj")
        print()

        if epg_ids:
            print(f"[3/3] AI dusitas DeepSeek-kel ({len(epg_ids)} program)...")
            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    resp = await client.post(
                        EPG_ENRICH_URL,
                        json={"program_ids": epg_ids},
                    )
                    if resp.status_code == 200:
                        results = resp.json()
                        print(f"  OK: {len(results)} program dusitva")
                        for r in results[:5]:
                            print(f"    {r['clean_title']}: {r['pow_synopsis'][:60]}...")
                    else:
                        print(f"  Enrich valasz: HTTP {resp.status_code}")
                        print(f"  Reszletek: {resp.text[:200]}")
            except Exception as e:
                print(f"  Enrich hiba: {str(e)[:200]}")
                print(f"  Megjegyzes: Ha a DeepSeek API kulcs nincs beallitva (.env),")
                print(f"  az enrichment nem fog mukodni. Az EPG programok igy is mentve vannak.")

        print()
        print("=" * 60)
        print(" KESZ!")
        print(f"  Filmek:   {movie_count} uj, {embed_count} embedding")
        print(f"  EPG:      {epg_count} uj program")
        print(f"  Most teszteld: curl -X POST http://localhost:8000/api/v1/search/semantic")
        print(f"    -d '{{\"query\":\"katona levagott labbal rakasz\"}}'")
        print("=" * 60)

asyncio.run(main())
