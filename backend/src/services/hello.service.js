const helloRepository = require('../repositories/hello.repository');

const DEFAULT_MESSAGE = 'hello mundo';

const getLatestMessage = async () => {
  const latest = await helloRepository.findLatestMessage();
  return latest?.message ?? DEFAULT_MESSAGE;
};

module.exports = {
  getLatestMessage,
  DEFAULT_MESSAGE,
};
