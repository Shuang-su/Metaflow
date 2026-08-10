import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dataRoot = fileURLToPath(new URL('../../data/', import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const EVENT_RESOURCES = [
    {
        subcategory: 'bitcity260711', folder: '4D_A002C0062_709_3840 天宫赐福_异域谢怜',
        id: 'xielian', title: '天官赐福 异域谢怜', titleEn: 'Xie Lian', date: '2026-07-11', device: '709'
    },
    {
        subcategory: 'bitcity260711', folder: '4D_A002C0063_709_3840 雷姆',
        id: 'rem', title: '雷姆', titleEn: 'Rem', date: '2026-07-11', device: '709'
    },
    {
        subcategory: 'bitcity260711', folder: 'P4P_20260711203735_0514_709 天宫赐福_异域谢怜2',
        id: 'xielian2', title: '天官赐福 异域谢怜 2', titleEn: 'Xie Lian 2', date: '2026-07-11', device: '709'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0024_260724_PQWJ 茄皇',
        id: 'sandrone', title: '桑多涅', titleEn: 'Sandrone', date: '2026-07-24', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0026_260724_PQWJ 女警雷姆',
        id: 'rem', title: '女警雷姆', titleEn: 'Rem', date: '2026-07-24', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0028_260724_PQWJ 麦晓雯 维什戴尔',
        id: 'hackclaw', title: '麦晓雯 维什戴尔', titleEn: 'Hackclaw (Mai Xiaowen)', date: '2026-07-24', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0033_260724_PQWJ 傩戏大祭司',
        id: 'dajishi', title: '傩戏大祭司', titleEn: 'Dajishi', date: '2026-07-24', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0034_260724_PQWJ 露娜霜月吟',
        id: 'luna', title: '露娜 霜月吟', titleEn: 'Luna', date: '2026-07-24', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0035_260724_PQWJ 花园新泽西花嫁',
        id: 'new-jersey', title: '花园 新泽西 花嫁', titleEn: 'New Jersey', date: '2026-07-24', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0044_260724_PQWJ 西施续相思',
        id: 'shi', title: '西施 续相思', titleEn: 'Shi', date: '2026-07-24', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0049_260725_PQWJ 雨诺',
        id: 'yunuo', title: '雨诺 Akari', titleEn: 'Akari', date: '2026-07-25', device: 'PQWJ',
        aliases: ['/acg/szcaf15/akari']
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0084_260725_PQWJ 红夫人虚妄',
        id: 'bloody-queen', title: '红夫人 虚妄', titleEn: 'Bloody Queen', date: '2026-07-25', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0085_260725_PQWJ 瑶时之祈愿',
        id: 'yaria', title: '瑶 时之祈愿', titleEn: 'Yaria', date: '2026-07-25', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0086_260725_PQWJ 1999伊索尔德若向死振翅',
        id: 'isolde', title: '重返未来 1999 伊索尔德 若向死振翅', titleEn: 'Isolde', date: '2026-07-25', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0087_260725_PQWJ 嫦娥落星盏',
        id: 'chang-e', title: '嫦娥 落星盏', titleEn: "Chang'e", date: '2026-07-25', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0090_260725_PQWJ 达妮娅',
        id: 'denia', title: '达妮娅', titleEn: 'Denia', date: '2026-07-25', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0091_260725_PQWJ 达妮娅2',
        id: 'denia2', title: '达妮娅 2', titleEn: 'Denia 2', date: '2026-07-25', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0092_260725_PQWJ 娜维娅',
        id: 'navia', title: '娜维娅', titleEn: 'Navia', date: '2026-07-25', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0093_260725_PQWJ 知更鸟',
        id: 'robin', title: '知更鸟', titleEn: 'Robin', date: '2026-07-25', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0105_260725_PQWJ 雷姆双人',
        id: 'rem-duo', title: '雷姆 双人', titleEn: 'Rem Duo', date: '2026-07-25', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0214_260726_PQWJ 貂蝉馥梦繁花2',
        id: 'diaochan2', title: '貂蝉 馥梦繁花 2', titleEn: 'Diaochan 2', date: '2026-07-26', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0221_260726_PQWJ 舞女琉璃的月光',
        id: 'female-dancer', title: '舞女 琉璃的月光', titleEn: 'Female Dancer', date: '2026-07-26', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0222_260726_PQWJ 李信问剑心',
        id: 'lixin', title: '李信 问剑心', titleEn: 'Li Xin', date: '2026-07-26', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0223_260726_PQWJ 公孙离 离恨烟',
        id: 'arli', title: '公孙离 离恨烟', titleEn: 'Arli', date: '2026-07-26', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0224_260726_PQWJ 赛车初音',
        id: 'racing-miku', title: '赛车初音', titleEn: 'Racing Miku', date: '2026-07-26', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0225_260726_PQWJ 小乔',
        id: 'xiaoqiao', title: '小乔', titleEn: 'Xiao Qiao', date: '2026-07-26', device: 'PQWJ'
    },
    {
        subcategory: 'szcaf15', folder: 'A001C0226_260726_PQWJ 殷紫萍 天禄瑞光',
        id: 'zipingyin', title: '殷紫萍 天禄瑞光', titleEn: 'Ziping Yin', date: '2026-07-26', device: 'PQWJ'
    }
];

const FORBIDDEN_ROUTE_VARIANTS = [
    '/acg/bitcity260711/xie-lian',
    '/acg/bitcity260711/xie-lian-2',
    '/acg/szcaf15/li-xin',
    '/acg/szcaf15/xiao-qiao',
    '/acg/szcaf15/ziping-yin',
    '/acg/szcaf15/denia-2',
    '/acg/szcaf15/diaochan-2',
    '/acg/szcaf15/newjersey',
    '/acg/szcaf15/bloodyqueen',
    '/acg/szcaf15/femaledancer',
    '/acg/szcaf15/racingmiku'
];

test('BitCity and SZCAF resources keep their explicit public naming and three-file packages', async () => {
    const index = await readJson(new URL('../../data/index.json', import.meta.url));
    const routeMap = new Map(index.resources.map((resource) => [resource.route, resource]));

    assert.equal(index.schemaVersion, '1.2');
    assert.equal(index.totalResources, 87);
    assert.deepEqual(index.subcategories.bitcity260711, {
        name: 'BitCity 次元小镇 · 2026-07-11',
        device: '709'
    });
    assert.deepEqual(index.subcategories.szcaf15, {
        name: '第十五届深圳动漫节',
        device: 'PQWJ'
    });

    for (const expected of EVENT_RESOURCES) {
        const route = `/acg/${expected.subcategory}/${expected.id}`;
        const resource = routeMap.get(route);
        assert.ok(resource, `missing canonical route ${route}`);
        assert.equal(resource.id, expected.id);
        assert.equal(resource.title, expected.title);
        assert.equal(resource.titleEn, expected.titleEn);
        assert.deepEqual(resource.category, ['acg', expected.subcategory]);
        assert.equal(resource.source, 'photogrammetry');
        assert.equal(resource.experienceType, 'character');
        assert.deepEqual(resource.viewer, {
            syntheticAnimation: 'figure8',
            animationFirstExitMode: 'orbit'
        });
        assert.deepEqual(resource.aliases, expected.aliases);
        assert.deepEqual(resource.meta, {
            date: expected.date,
            device: expected.device,
            folderName: expected.folder
        });

        const dataDirectory = expected.subcategory === 'bitcity260711' ? 'BitCity260711' : 'SZCAF15';
        const relativeDirectory = `ACG/${dataDirectory}/${expected.folder}`;
        assert.equal(resource.files.model, `${relativeDirectory}/${expected.folder}.sog`);
        assert.equal(resource.files.thumbnail, `${relativeDirectory}/${expected.folder}.jpg`);
        assert.equal(resource.files.settings, `${relativeDirectory}/settings-v2.json`);
        assert.equal(resource.files.environment, null);

        const directory = `${dataRoot}${relativeDirectory}`;
        const packageFiles = (await readdir(directory)).toSorted();
        assert.deepEqual(packageFiles, [
            `${expected.folder}.jpg`,
            `${expected.folder}.sog`,
            'settings-v2.json'
        ].toSorted(), `${route} must contain only the public three-file package`);
        for (const relativePath of [resource.files.model, resource.files.thumbnail, resource.files.settings]) {
            assert.ok((await stat(`${dataRoot}${relativePath}`)).isFile(), `missing ${relativePath}`);
        }

        const settings = await readJson(`${directory}/settings-v2.json`);
        assert.deepEqual(settings.animTracks, []);
        assert.equal(settings.startMode, 'default');
        assert.equal(settings.hasStartPose, true);
        assert.ok(settings.cameras?.[0]?.initial?.position, `${route} is missing initial camera position`);
        assert.ok(settings.cameras?.[0]?.initial?.target, `${route} is missing initial camera target`);
        assert.notEqual(settings.cameras?.[0]?.initial?.fov, undefined, `${route} is missing initial camera fov`);
    }

    assert.equal(EVENT_RESOURCES.filter((resource) => resource.subcategory === 'bitcity260711').length, 3);
    assert.equal(EVENT_RESOURCES.filter((resource) => resource.subcategory === 'szcaf15').length, 24);
    assert.equal(
        index.resources.filter((resource) => resource.route.startsWith('/acg/bitcity260711/')).length,
        3
    );
    assert.equal(
        index.resources.filter((resource) => resource.route.startsWith('/acg/szcaf15/')).length,
        24
    );
});

test('Akari is the only event alias and unapproved slug variants stay absent', async () => {
    const index = await readJson(new URL('../../data/index.json', import.meta.url));
    const eventResources = index.resources.filter((resource) => (
        resource.route.startsWith('/acg/bitcity260711/') || resource.route.startsWith('/acg/szcaf15/')
    ));
    const aliases = eventResources.flatMap((resource) => resource.aliases || []);
    const allPublicRoutes = new Set([
        ...index.resources.map((resource) => resource.route),
        ...index.resources.flatMap((resource) => resource.aliases || [])
    ]);

    assert.deepEqual(aliases, ['/acg/szcaf15/akari']);
    const yunuo = index.resources.find((resource) => resource.route === '/acg/szcaf15/yunuo');
    assert.ok(yunuo);
    assert.ok(yunuo.aliases.includes('/acg/szcaf15/akari'));
    for (const route of FORBIDDEN_ROUTE_VARIANTS) {
        assert.equal(allPublicRoutes.has(route), false, `unapproved route exists: ${route}`);
    }
});
