import { INSTANCE_WRITE_MODES, MessageBuilders } from './messageTypes';

describe('MessageBuilders.runInstance', () => {
  test('defaults interactive inference to patch mode', () => {
    const message = MessageBuilders.runInstance('instance-model');

    expect(message.data).toEqual({
      model_registry_key: 'instance-model',
      write_mode: INSTANCE_WRITE_MODES.PATCH,
    });
  });

  test('preserves override mode in the websocket payload', () => {
    const message = MessageBuilders.runInstance(
      'instance-model',
      INSTANCE_WRITE_MODES.OVERRIDE
    );

    expect(message.data.write_mode).toBe('override');
  });
});
