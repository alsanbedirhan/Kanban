using Kanban.Entities;
using Kanban.Repositories;

namespace Kanban.Services
{
    public class KanbanService : IKanbanService
    {
        private readonly IKanbanRepository _kanbanRepository;
        public KanbanService(IKanbanRepository kanbanRepository)
        {
            _kanbanRepository = kanbanRepository;
        }

        public async Task<ServiceResult<List<Board>>> GetBoards(long userId)
        {
            try
            {
                return ServiceResult<List<Board>>.Ok(await _kanbanRepository.GetBoards(userId));
            }
            catch (Exception)
            {
                return ServiceResult<List<Board>>.Fail("Veri tabanında hata oluştu, lütfen tekrar deneyiniz.");
            }
        }
    }
}
