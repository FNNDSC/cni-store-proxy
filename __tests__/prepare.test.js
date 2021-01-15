const Cube = require('../src/cube');
const config = require('../src/config');

const cube = new Cube(
  config.cube.url,
  config.cube.username,
  config.cube.password
);

describe('prepare', () => {
  test('should have created a feed', async () => {
    const feed = await cube.searchFeed(config.feed.name);
    expect(feed).toBeDefined();
    expect(feed.plugin_instances).toBeDefined();
    const pi = await cube.get({ url: feed.plugin_instances });
    expect(pi).toBeDefined();
    expect(pi.results).toHaveLength(1);
    expect(pi.results[0].plugin_name).toBe(config.plugins.fs.name);
  });
});
