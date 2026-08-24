import { ConsultarView } from '../../ConsultarView'

/**
 * Link direto enviado por WhatsApp (/consultar/{phone}/{otp}) -- abre já
 * verificando o código, sem o cliente precisar digitar nada.
 */
export default async function ConsultarWithOtpPage({
  params,
}: {
  params: Promise<{ phone: string; otp: string }>
}) {
  const { phone, otp } = await params
  return <ConsultarView initialPhone={phone} initialOtp={otp} />
}
