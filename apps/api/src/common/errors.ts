import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('API');
  catch(error: any, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse();
    const request = context.getRequest();
    const requestId = request.requestId;
    if (error instanceof HttpException)
      return response
        .status(error.getStatus())
        .json({ message: error.message, request_id: requestId });
    const code = error.code || error.cause?.code;
    if (['23503', '23514', '23502', '22P02', '22003'].includes(code))
      return response.status(400).json({
        message:
          'Os dados não respeitam as regras financeiras ou referenciam um registro indisponível.',
        request_id: requestId,
      });
    if (code === '23505')
      return response.status(409).json({
        message: 'Este registro já existe ou a operação já foi concluída.',
        request_id: requestId,
      });
    this.logger.error(
      `Falha interna (${code || error.constructor?.name || 'unknown'}), request ${requestId || 'unknown'}`,
    );
    return response.status(500).json({
      message: 'Não foi possível concluir a operação. Tente novamente.',
      request_id: requestId,
    });
  }
}
