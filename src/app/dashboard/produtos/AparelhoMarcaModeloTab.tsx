'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Smartphone, Tag, Boxes, Plus, Trash2, Pencil, Loader2, Check } from 'lucide-react'
import Dialog from '@/components/ui/Dialog'
import { capitalizeFirst } from '@/lib/utils/text'

interface Category { id: string; name: string; slug: string; sort_order: number; device_type_id: string | null }
interface DeviceType { id: string; name: string; slug: string; icon_key: string; sort_order: number }
interface CatalogModel { id: string; brand_id: string; name: string; sort_order: number }

const INPUT = 'w-full px-3 py-2 rounded-lg border border-white/10 bg-vr-black text-white placeholder-white/25 text-sm outline-none focus:border-vr-red/60 transition-all'

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

interface Props {
  categories: Category[]
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>
  deviceTypes: DeviceType[]
  setDeviceTypes: React.Dispatch<React.SetStateAction<DeviceType[]>>
  models: CatalogModel[]
  setModels: React.Dispatch<React.SetStateAction<CatalogModel[]>>
}

/**
 * Cadastro individual de aparelho/marca/modelo, num container só --
 * saneia as páginas de Produtos e Serviços, que ficavam poluídas com
 * form de cadastro desses 3 dados. O cadastro dinâmico via busca
 * (dentro dos forms de produto/serviço) continua existindo à parte;
 * esta aba é só a gestão centralizada (listar/editar/excluir).
 */
export default function AparelhoMarcaModeloTab({
  categories, setCategories, deviceTypes, setDeviceTypes, models, setModels,
}: Props) {
  // Aparelho
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<DeviceType | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [savingDevice, setSavingDevice] = useState(false)

  // Marca
  const [brandDialogOpen, setBrandDialogOpen] = useState(false)
  const [editingBrand, setEditingBrand] = useState<Category | null>(null)
  const [brandName, setBrandName] = useState('')
  const [brandDeviceId, setBrandDeviceId] = useState('')
  const [savingBrand, setSavingBrand] = useState(false)

  // Modelo
  const [modelDialogOpen, setModelDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<CatalogModel | null>(null)
  const [modelName, setModelName] = useState('')
  const [modelBrandId, setModelBrandId] = useState('')
  const [savingModel, setSavingModel] = useState(false)

  // Confirmação de exclusão (compartilhada pelos 3 tipos)
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'device' | 'brand' | 'model'; id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openNewDevice = () => { setEditingDevice(null); setDeviceName(''); setDeviceDialogOpen(true) }
  const openEditDevice = (d: DeviceType) => { setEditingDevice(d); setDeviceName(d.name); setDeviceDialogOpen(true) }

  const saveDevice = async () => {
    const name = capitalizeFirst(deviceName)
    if (!name) return
    setSavingDevice(true)
    const supabase = createClient()
    if (editingDevice) {
      const { data, error } = await supabase.from('device_types').update({ name }).eq('id', editingDevice.id).select().single()
      setSavingDevice(false)
      if (error || !data) return
      setDeviceTypes((prev) => prev.map((d) => (d.id === editingDevice.id ? (data as DeviceType) : d)))
    } else {
      const { data, error } = await supabase
        .from('device_types')
        .insert({ name, slug: slugify(name) || crypto.randomUUID(), icon_key: 'generic', sort_order: deviceTypes.length })
        .select().single()
      setSavingDevice(false)
      if (error || !data) return
      setDeviceTypes((prev) => [...prev, data as DeviceType])
    }
    setDeviceDialogOpen(false)
  }

  const confirmDeleteDevice = async (id: string) => {
    const supabase = createClient()
    await supabase.from('device_types').delete().eq('id', id)
    setDeviceTypes((prev) => prev.filter((d) => d.id !== id))
  }

  const openNewBrand = () => { setEditingBrand(null); setBrandName(''); setBrandDeviceId(deviceTypes[0]?.id ?? ''); setBrandDialogOpen(true) }
  const openEditBrand = (cat: Category) => { setEditingBrand(cat); setBrandName(cat.name); setBrandDeviceId(cat.device_type_id ?? deviceTypes[0]?.id ?? ''); setBrandDialogOpen(true) }

  const saveBrand = async () => {
    const name = capitalizeFirst(brandName)
    if (!name) return
    setSavingBrand(true)
    const supabase = createClient()
    if (editingBrand) {
      const { data, error } = await supabase
        .from('service_catalog_categories')
        .update({ name, slug: slugify(name), device_type_id: brandDeviceId || null })
        .eq('id', editingBrand.id)
        .select().single()
      setSavingBrand(false)
      if (error || !data) return
      setCategories((prev) => prev.map((c) => (c.id === editingBrand.id ? (data as Category) : c)))
    } else {
      const { data, error } = await supabase
        .from('service_catalog_categories')
        .insert({ name, slug: slugify(name) || crypto.randomUUID(), sort_order: categories.length, device_type_id: brandDeviceId || null })
        .select().single()
      setSavingBrand(false)
      if (error || !data) return
      setCategories((prev) => [...prev, data as Category])
    }
    setBrandDialogOpen(false)
  }

  const confirmDeleteBrand = async (id: string) => {
    const supabase = createClient()
    await supabase.from('service_catalog_categories').delete().eq('id', id)
    setCategories((prev) => prev.filter((c) => c.id !== id))
    setModels((prev) => prev.filter((m) => m.brand_id !== id))
  }

  const openNewModel = () => { setEditingModel(null); setModelName(''); setModelBrandId(categories[0]?.id ?? ''); setModelDialogOpen(true) }
  const openEditModel = (m: CatalogModel) => { setEditingModel(m); setModelName(m.name); setModelBrandId(m.brand_id); setModelDialogOpen(true) }

  const saveModel = async () => {
    const name = capitalizeFirst(modelName)
    if (!name || !modelBrandId) return
    setSavingModel(true)
    const supabase = createClient()
    if (editingModel) {
      const { data, error } = await supabase
        .from('catalog_models')
        .update({ name, brand_id: modelBrandId })
        .eq('id', editingModel.id)
        .select().single()
      setSavingModel(false)
      if (error || !data) return
      setModels((prev) => prev.map((m) => (m.id === editingModel.id ? (data as CatalogModel) : m)))
    } else {
      const { data, error } = await supabase
        .from('catalog_models')
        .insert({ name, brand_id: modelBrandId, sort_order: models.length })
        .select().single()
      setSavingModel(false)
      if (error || !data) return
      setModels((prev) => [...prev, data as CatalogModel])
    }
    setModelDialogOpen(false)
  }

  const confirmDeleteModel = async (id: string) => {
    const supabase = createClient()
    await supabase.from('catalog_models').delete().eq('id', id)
    setModels((prev) => prev.filter((m) => m.id !== id))
  }

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    if (confirmDelete.kind === 'device') await confirmDeleteDevice(confirmDelete.id)
    else if (confirmDelete.kind === 'brand') await confirmDeleteBrand(confirmDelete.id)
    else await confirmDeleteModel(confirmDelete.id)
    setDeleting(false)
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide flex items-center gap-1.5">
        <Smartphone className="w-3.5 h-3.5" />
        Aparelho / Marca / Modelo
      </p>

      {/* Aparelhos */}
      <div className="bg-vr-graphite border border-white/5 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-vr-silver/70 flex items-center gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Aparelhos</h2>
          <button onClick={openNewDevice} className="flex items-center gap-1 text-xs font-semibold bg-vr-black border border-white/10 text-white px-2.5 py-1.5 rounded-lg hover:border-vr-red/40 transition-colors">
            <Plus className="w-3 h-3" /> Aparelho
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {deviceTypes.map((d) => (
            <div key={d.id} className="flex items-center gap-1 bg-vr-black border border-white/10 rounded-lg px-3 py-1.5">
              <span className="text-sm text-white">{d.name}</span>
              <button onClick={() => openEditDevice(d)} className="text-vr-silver/30 hover:text-vr-red transition-colors ml-1"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => setConfirmDelete({ kind: 'device', id: d.id, name: d.name })} className="text-vr-silver/30 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
          {deviceTypes.length === 0 && <p className="text-xs text-vr-silver/40">Nenhum aparelho cadastrado.</p>}
        </div>
      </div>

      {/* Marcas */}
      <div className="bg-vr-graphite border border-white/5 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-vr-silver/70 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Marcas</h2>
          <button onClick={openNewBrand} disabled={deviceTypes.length === 0} className="flex items-center gap-1 text-xs font-semibold bg-vr-black border border-white/10 text-white px-2.5 py-1.5 rounded-lg hover:border-vr-red/40 transition-colors disabled:opacity-40">
            <Plus className="w-3 h-3" /> Marca
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-1 bg-vr-black border border-white/10 rounded-lg px-3 py-1.5">
              <span className="text-sm text-white">{cat.name}</span>
              <span className="text-[10px] text-vr-silver/40">{deviceTypes.find((d) => d.id === cat.device_type_id)?.name ?? '—'}</span>
              <button onClick={() => openEditBrand(cat)} className="text-vr-silver/30 hover:text-vr-red transition-colors ml-1"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => setConfirmDelete({ kind: 'brand', id: cat.id, name: cat.name })} className="text-vr-silver/30 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
          {categories.length === 0 && <p className="text-xs text-vr-silver/40">Nenhuma marca cadastrada.</p>}
        </div>
      </div>

      {/* Modelos */}
      <div className="bg-vr-graphite border border-white/5 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-vr-silver/70 flex items-center gap-1.5"><Boxes className="w-3.5 h-3.5" /> Modelos</h2>
          <button onClick={openNewModel} disabled={categories.length === 0} className="flex items-center gap-1 text-xs font-semibold bg-vr-black border border-white/10 text-white px-2.5 py-1.5 rounded-lg hover:border-vr-red/40 transition-colors disabled:opacity-40">
            <Plus className="w-3 h-3" /> Modelo
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {models.map((m) => (
            <div key={m.id} className="flex items-center gap-1 bg-vr-black border border-white/10 rounded-lg px-3 py-1.5">
              <span className="text-sm text-white">{m.name}</span>
              <span className="text-[10px] text-vr-silver/40">{categories.find((c) => c.id === m.brand_id)?.name ?? '—'}</span>
              <button onClick={() => openEditModel(m)} className="text-vr-silver/30 hover:text-vr-red transition-colors ml-1"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => setConfirmDelete({ kind: 'model', id: m.id, name: m.name })} className="text-vr-silver/30 hover:text-red-400 transition-colors"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
          {models.length === 0 && <p className="text-xs text-vr-silver/40">Nenhum modelo cadastrado.</p>}
        </div>
      </div>

      <Dialog open={deviceDialogOpen} onClose={() => setDeviceDialogOpen(false)} title={editingDevice ? 'Editar aparelho' : 'Novo aparelho'}>
        <div className="space-y-3">
          <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Nome (ex: Smartwatch)" className={INPUT} />
          <button onClick={saveDevice} disabled={savingDevice || !deviceName.trim()} className="w-full bg-vr-red text-white font-semibold py-2.5 rounded-xl hover:bg-vr-red/90 transition-colors text-sm disabled:opacity-40 flex items-center justify-center gap-2">
            {savingDevice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {savingDevice ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </Dialog>

      <Dialog open={brandDialogOpen} onClose={() => setBrandDialogOpen(false)} title={editingBrand ? 'Editar marca' : 'Nova marca'}>
        <div className="space-y-3">
          <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Nome da marca" className={INPUT} />
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Aparelho</label>
            <select value={brandDeviceId} onChange={(e) => setBrandDeviceId(e.target.value)} className={`${INPUT} mt-1`}>
              {deviceTypes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button onClick={saveBrand} disabled={savingBrand || !brandName.trim()} className="w-full bg-vr-red text-white font-semibold py-2.5 rounded-xl hover:bg-vr-red/90 transition-colors text-sm disabled:opacity-40 flex items-center justify-center gap-2">
            {savingBrand ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {savingBrand ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </Dialog>

      <Dialog open={modelDialogOpen} onClose={() => setModelDialogOpen(false)} title={editingModel ? 'Editar modelo' : 'Novo modelo'}>
        <div className="space-y-3">
          <input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Nome do modelo (ex: iPhone 14 Pro)" className={INPUT} />
          <div>
            <label className="text-xs font-semibold text-vr-silver/60 uppercase tracking-wide">Marca</label>
            <select value={modelBrandId} onChange={(e) => setModelBrandId(e.target.value)} className={`${INPUT} mt-1`}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={saveModel} disabled={savingModel || !modelName.trim() || !modelBrandId} className="w-full bg-vr-red text-white font-semibold py-2.5 rounded-xl hover:bg-vr-red/90 transition-colors text-sm disabled:opacity-40 flex items-center justify-center gap-2">
            {savingModel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {savingModel ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </Dialog>

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirmar exclusão">
        <div className="space-y-3">
          <p className="text-sm text-vr-silver/70">
            Tem certeza que deseja excluir <strong className="text-white">{confirmDelete?.name}</strong>?
            {confirmDelete?.kind === 'brand' && ' Os modelos cadastrados nessa marca também serão removidos.'}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 text-sm font-semibold text-vr-silver/60 hover:text-white px-3 py-2.5 rounded-xl bg-vr-black border border-white/10">
              Cancelar
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl px-3 py-2.5 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Excluir
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
