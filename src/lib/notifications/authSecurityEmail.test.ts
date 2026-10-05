import { beforeEach, describe, expect, it, vi } from 'vitest';

const { canSendTransactionalEmailMock, sendTransactionalEmailMock } = vi.hoisted(() => ({
  canSendTransactionalEmailMock: vi.fn(),
  sendTransactionalEmailMock: vi.fn(),
}));

vi.mock('@/lib/notifications/transactionalEmail', () => ({
  canSendTransactionalEmail: canSendTransactionalEmailMock,
  sendTransactionalEmail: sendTransactionalEmailMock,
}));

describe('authSecurityEmail', () => {
  beforeEach(() => {
    canSendTransactionalEmailMock.mockReset();
    sendTransactionalEmailMock.mockReset();
  });

  it('falla explicitamente si el enlace de activacion no puede enviarse por falta de canal transaccional', async () => {
    canSendTransactionalEmailMock.mockReturnValue(false);
    const { sendCredentialTransitionLinkEmail } = await import('./authSecurityEmail');

    await expect(
      sendCredentialTransitionLinkEmail(
        { email: 'ana@empresa.com' },
        {
          title: 'Confirma tu correo',
          intro: 'Valida tu cuenta.',
          actionLabel: 'Confirmar',
          actionHref: 'https://beteele-one.com/api/auth/confirm?flow_id=flow-1',
          text: 'Confirma tu cuenta.',
        }
      )
    ).rejects.toThrow('El canal de email transaccional no esta configurado');

    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('falla explicitamente si el OTP de rescate no puede enviarse por falta de canal transaccional', async () => {
    canSendTransactionalEmailMock.mockReturnValue(false);
    const { sendActivationOtpEmail } = await import('./authSecurityEmail');

    await expect(sendActivationOtpEmail({ email: 'ana@empresa.com' }, '123456')).rejects.toThrow(
      'El canal de email transaccional no esta configurado'
    );

    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });
});
