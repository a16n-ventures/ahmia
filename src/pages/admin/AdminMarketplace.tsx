import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Store as StoreIcon, Package, Edit, Trash2, Loader2, MapPin, Phone } from 'lucide-react';
import { Store, StoreItem, STORE_CATEGORIES, DELIVERY_MODES } from '@/types/marketplace';
import { format } from 'date-fns';

export default function AdminMarketplace() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('stores');
  const [storeDialog, setStoreDialog] = useState(false);
  const [itemDialog, setItemDialog] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');

  // Form states
  const [storeForm, setStoreForm] = useState({
    name: '',
    description: '',
    logo_url: '',
    category: 'General',
    location: '',
    contact_phone: ''
  });

  const [itemForm, setItemForm] = useState({
    store_id: '',
    name: '',
    description: '',
    image_url: '',
    price: 0,
    discount_percent: 0,
    delivery_mode: 'onsite' as 'onsite' | 'payment_before_delivery',
    max_delivery_days: 3
  });

  // Fetch stores
  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ['admin_stores'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('stores') as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Store[];
    }
  });

  // Fetch items
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['admin_items'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('store_items') as any)
        .select(`*, store:stores!store_id(name, category)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as (StoreItem & { store: Pick<Store, 'name' | 'category'> })[];
    }
  });

  // Store mutations
  const createStoreMutation = useMutation({
    mutationFn: async (data: Partial<Store>) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');
      
      const { error } = await (supabase.from('stores') as any).insert({
        ...data,
        owner_id: user.user.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_stores'] });
      setStoreDialog(false);
      resetStoreForm();
      toast.success('Store created successfully');
    },
    onError: (error: any) => toast.error(error.message)
  });

  const updateStoreMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Store> }) => {
      const { error } = await (supabase.from('stores') as any)
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_stores'] });
      setStoreDialog(false);
      setEditingStore(null);
      resetStoreForm();
      toast.success('Store updated successfully');
    },
    onError: (error: any) => toast.error(error.message)
  });

  const deleteStoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('stores') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_stores'] });
      toast.success('Store deleted');
    },
    onError: (error: any) => toast.error(error.message)
  });

  const toggleStoreStatusMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase.from('stores') as any)
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_stores'] });
      toast.success('Store status updated');
    }
  });

  // Item mutations
  const createItemMutation = useMutation({
    mutationFn: async (data: Partial<StoreItem>) => {
      const { error } = await (supabase.from('store_items') as any).insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_items'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      setItemDialog(false);
      resetItemForm();
      toast.success('Item created successfully');
    },
    onError: (error: any) => toast.error(error.message)
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<StoreItem> }) => {
      const { error } = await (supabase.from('store_items') as any)
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_items'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      setItemDialog(false);
      setEditingItem(null);
      resetItemForm();
      toast.success('Item updated successfully');
    },
    onError: (error: any) => toast.error(error.message)
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('store_items') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_items'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      toast.success('Item deleted');
    },
    onError: (error: any) => toast.error(error.message)
  });

  const toggleItemAvailabilityMutation = useMutation({
    mutationFn: async ({ id, is_available }: { id: string; is_available: boolean }) => {
      const { error } = await (supabase.from('store_items') as any)
        .update({ is_available })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_items'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace_items'] });
      toast.success('Item availability updated');
    }
  });

  // Helpers
  const resetStoreForm = () => {
    setStoreForm({ name: '', description: '', logo_url: '', category: 'General', location: '', contact_phone: '' });
  };

  const resetItemForm = () => {
    setItemForm({ store_id: '', name: '', description: '', image_url: '', price: 0, discount_percent: 0, delivery_mode: 'onsite', max_delivery_days: 3 });
  };

  const openEditStore = (store: Store) => {
    setEditingStore(store);
    setStoreForm({
      name: store.name,
      description: store.description || '',
      logo_url: store.logo_url || '',
      category: store.category,
      location: store.location || '',
      contact_phone: store.contact_phone || ''
    });
    setStoreDialog(true);
  };

  const openEditItem = (item: StoreItem) => {
    setEditingItem(item);
    setItemForm({
      store_id: item.store_id,
      name: item.name,
      description: item.description || '',
      image_url: item.image_url || '',
      price: item.price,
      discount_percent: item.discount_percent,
      delivery_mode: item.delivery_mode,
      max_delivery_days: item.max_delivery_days
    });
    setItemDialog(true);
  };

  const handleStoreSubmit = () => {
    if (!storeForm.name.trim()) {
      toast.error('Store name is required');
      return;
    }

    if (editingStore) {
      updateStoreMutation.mutate({ id: editingStore.id, data: storeForm });
    } else {
      createStoreMutation.mutate(storeForm);
    }
  };

  const handleItemSubmit = () => {
    if (!itemForm.name.trim() || !itemForm.store_id) {
      toast.error('Item name and store are required');
      return;
    }

    if (editingItem) {
      updateItemMutation.mutate({ id: editingItem.id, data: itemForm });
    } else {
      createItemMutation.mutate(itemForm);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0
    }).format(price);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Marketplace</h2>
          <p className="text-muted-foreground">Manage stores and items</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
            <StoreIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stores.length}</div>
            <p className="text-xs text-muted-foreground">
              {stores.filter(s => s.is_active).length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{items.length}</div>
            <p className="text-xs text-muted-foreground">
              {items.filter(i => i.is_available).length} available
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(stores.map(s => s.category)).size}
            </div>
            <p className="text-xs text-muted-foreground">unique categories</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="stores">Stores</TabsTrigger>
            <TabsTrigger value="items">Items</TabsTrigger>
          </TabsList>
          {activeTab === 'stores' ? (
            <Dialog open={storeDialog} onOpenChange={(open) => { setStoreDialog(open); if (!open) { setEditingStore(null); resetStoreForm(); } }}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" /> Add Store</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingStore ? 'Edit Store' : 'Add New Store'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Store Name *</Label>
                    <Input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} placeholder="My Awesome Store" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={storeForm.description} onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })} placeholder="What do you sell?" />
                  </div>
                  <div className="space-y-2">
                    <Label>Logo URL</Label>
                    <Input value={storeForm.logo_url} onChange={(e) => setStoreForm({ ...storeForm, logo_url: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={storeForm.category} onValueChange={(v) => setStoreForm({ ...storeForm, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STORE_CATEGORIES.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Location</Label>
                    <Input value={storeForm.location} onChange={(e) => setStoreForm({ ...storeForm, location: e.target.value })} placeholder="Lagos, Nigeria" />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input value={storeForm.contact_phone} onChange={(e) => setStoreForm({ ...storeForm, contact_phone: e.target.value })} placeholder="+234..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleStoreSubmit} disabled={createStoreMutation.isPending || updateStoreMutation.isPending}>
                    {(createStoreMutation.isPending || updateStoreMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingStore ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={itemDialog} onOpenChange={(open) => { setItemDialog(open); if (!open) { setEditingItem(null); resetItemForm(); } }}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" /> Add Item</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  <div className="space-y-2">
                    <Label>Store *</Label>
                    <Select value={itemForm.store_id} onValueChange={(v) => setItemForm({ ...itemForm, store_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                      <SelectContent>
                        {stores.filter(s => s.is_active).map((store) => (
                          <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Item Name *</Label>
                    <Input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="Product name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} placeholder="Item details" />
                  </div>
                  <div className="space-y-2">
                    <Label>Image URL</Label>
                    <Input value={itemForm.image_url} onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Price (NGN)</Label>
                      <Input type="number" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: Number(e.target.value) })} min={0} />
                    </div>
                    <div className="space-y-2">
                      <Label>Discount %</Label>
                      <Input type="number" value={itemForm.discount_percent} onChange={(e) => setItemForm({ ...itemForm, discount_percent: Number(e.target.value) })} min={0} max={100} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Delivery Mode</Label>
                    <Select value={itemForm.delivery_mode} onValueChange={(v: 'onsite' | 'payment_before_delivery') => setItemForm({ ...itemForm, delivery_mode: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="onsite">Pay on Delivery</SelectItem>
                        <SelectItem value="payment_before_delivery">Pay Before Delivery</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Delivery Days (1-7)</Label>
                    <Input type="number" value={itemForm.max_delivery_days} onChange={(e) => setItemForm({ ...itemForm, max_delivery_days: Math.min(7, Math.max(1, Number(e.target.value))) })} min={1} max={7} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleItemSubmit} disabled={createItemMutation.isPending || updateItemMutation.isPending}>
                    {(createItemMutation.isPending || updateItemMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingItem ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Stores Tab */}
        <TabsContent value="stores">
          {storesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => (
                    <TableRow key={store.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={store.logo_url || undefined} />
                            <AvatarFallback>{store.name[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{store.name}</p>
                            {store.contact_phone && <p className="text-xs text-muted-foreground">{store.contact_phone}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{store.category}</Badge></TableCell>
                      <TableCell className="text-sm">{store.location || '-'}</TableCell>
                      <TableCell>
                        <Switch checked={store.is_active} onCheckedChange={(checked) => toggleStoreStatusMutation.mutate({ id: store.id, is_active: checked })} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(store.created_at), 'MMM d, yyyy')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditStore(store)}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteStoreMutation.mutate(store.id)}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {stores.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No stores yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Items Tab */}
        <TabsContent value="items">
          {itemsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Store</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Delivery</TableHead>
                    <TableHead>Available</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                            {item.image_url ? (
                              <img src={item.image_url} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <Package className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            {item.discount_percent > 0 && <Badge className="text-[10px] bg-red-500">-{item.discount_percent}%</Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{(item as any).store?.name || '-'}</TableCell>
                      <TableCell className="font-medium">{formatPrice(item.price)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{DELIVERY_MODES[item.delivery_mode]}</Badge>
                        <p className="text-xs text-muted-foreground mt-1">{item.max_delivery_days}d max</p>
                      </TableCell>
                      <TableCell>
                        <Switch checked={item.is_available} onCheckedChange={(checked) => toggleItemAvailabilityMutation.mutate({ id: item.id, is_available: checked })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEditItem(item)}><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteItemMutation.mutate(item.id)}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No items yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
