const Cube = require('../src/cube');

const cube = new Cube(
  process.env.CUBE_URL,
  process.env.CUBE_USERNAME,
  process.env.CUBE_PASSWORD
);

describe('prepare', () => {
  test('should have created a feed', async () => {
    const feed = await cube.searchFeed(process.env.FEED_NAME);
    expect(feed).toBeDefined();
    expect(feed.plugin_instances).toBeDefined();
    const pi = await cube.get({ url: feed.plugin_instances });
    expect(pi).toBeDefined();
    expect(pi.results).toHaveLength(1);
    expect(pi.results[0].plugin_name).toBe(process.env.FS_PLUGIN_NAME);
  });
});
